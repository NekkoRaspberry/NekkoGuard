# ruff: noqa: PLR2004 - HTTP status codes
"""
Sign-in, two-factor, recovery codes, password reset, email verification, sign-out and
active sessions — end to end through the allauth headless API the frontend uses (#110).
"""

import re
from urllib.parse import unquote

import pytest
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.recovery_codes.internal.auth import RecoveryCodes
from allauth.mfa.utils import is_mfa_enabled
from allauth.usersessions.models import UserSession
from django.contrib.sessions.models import Session
from django.core import mail
from django.core.cache import cache
from django.test import Client

from nekkoguard.conftest import TEST_PASSWORD
from nekkoguard.conftest import enable_totp
from nekkoguard.conftest import totp_code
from nekkoguard.conftest import verified_user
from nekkoguard.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

AUTH = "/_allauth/browser/v1"
ME = "/api/users/me/"
NEW_PASSWORD = "brand-New-and-Long-pass-456"  # noqa: S105


def post(client, path, data=None, **extra):
    return client.post(
        f"{AUTH}{path}",
        data or {},
        content_type="application/json",
        **extra,
    )


def login(client, email, password=TEST_PASSWORD, *, user_agent="pytest-browser"):
    return post(
        client,
        "/auth/login",
        {"email": email, "password": password},
        HTTP_USER_AGENT=user_agent,
    )


def pending_flow(response) -> str | None:
    flows = response.json()["data"]["flows"]
    pending = [f["id"] for f in flows if f.get("is_pending")]
    return pending[0] if pending else None


def error_codes(response) -> set[str]:
    return {e.get("code") for e in response.json().get("errors", [])}


def signed_in(client) -> bool:
    return client.get(ME).status_code == 200


def link_key(kind: str) -> str:
    """The key in the last email's /verify-email/<key> or /reset-password/<key> link."""
    match = re.search(rf"/{kind}/([^\s/\"<>]+)", mail.outbox[-1].body)
    assert match, mail.outbox[-1].body
    return unquote(match.group(1))


def signed_in_client(user, **kwargs):
    client = Client()
    response = login(client, user.email, **kwargs)
    assert response.status_code == 200, response.content
    return client


# ------------------------------------------------------------------- sign in


class TestLogin:
    def test_valid_credentials_sign_in(self):
        user = verified_user()
        client = Client()
        assert not signed_in(client)
        response = login(client, user.email)
        assert response.status_code == 200
        assert response.json()["data"]["user"]["email"] == user.email
        assert response.json()["meta"]["is_authenticated"] is True
        assert signed_in(client)

    def test_email_is_case_insensitive(self):
        user = verified_user()
        assert login(Client(), user.email.upper()).status_code == 200

    def test_wrong_password_and_unknown_email_look_the_same(self):
        user = verified_user()
        wrong = login(Client(), user.email, "not-the-password-1")
        unknown = login(Client(), "nobody-here@gmail.com", "not-the-password-1")
        assert wrong.status_code == unknown.status_code == 400
        assert wrong.json() == unknown.json()

    def test_failed_sign_in_creates_no_session(self):
        user = verified_user()
        client = Client()
        login(client, user.email, "not-the-password-1")
        assert not signed_in(client)
        assert not UserSession.objects.exists()

    def test_inactive_user_cannot_sign_in(self):
        user = verified_user(is_active=False)
        client = Client()
        response = login(client, user.email)
        assert response.status_code in {400, 401}
        assert not signed_in(client)

    def test_unverified_email_must_be_verified_first(self):
        user = UserFactory(password=TEST_PASSWORD)
        EmailAddress.objects.create(
            user=user,
            email=user.email,
            verified=False,
            primary=True,
        )
        client = Client()
        response = login(client, user.email)
        assert response.status_code == 401
        assert pending_flow(response) == "verify_email"
        assert not signed_in(client)

    def test_csrf_token_is_required(self):
        user = verified_user()
        client = Client(enforce_csrf_checks=True)
        assert login(client, user.email).status_code == 403
        assert not signed_in(client)
        client.get(f"{AUTH}/config")  # sets the csrftoken cookie, as the frontend does
        token = client.cookies["csrftoken"].value
        response = post(
            client,
            "/auth/login",
            {"email": user.email, "password": TEST_PASSWORD},
            HTTP_X_CSRFTOKEN=token,
        )
        assert response.status_code == 200

    def test_signing_in_rotates_the_session_key(self):
        user = verified_user()
        client = Client()
        client.get(f"{AUTH}/config")
        client.session.save()
        before = client.session.session_key
        login(client, user.email)
        assert client.session.session_key != before

    def test_logout_ends_the_server_session(self):
        user = verified_user()
        client = signed_in_client(user)
        key = client.session.session_key
        response = client.delete(f"{AUTH}/auth/session")
        assert response.status_code == 401
        assert not signed_in(client)
        assert not Session.objects.filter(session_key=key).exists()


# ------------------------------------------------------------------- two-factor


class TestTwoFactor:
    def test_enrollment_needs_a_valid_code_before_it_is_enabled(self):
        user = verified_user()
        client = signed_in_client(user)
        setup = client.get(f"{AUTH}/account/authenticators/totp")
        assert (
            setup.status_code == 404
        )  # not set up yet; the response carries a new secret
        assert setup.json()["meta"]["secret"]
        assert setup.json()["meta"]["totp_url"].startswith("otpauth://totp/")
        assert "issuer=NekkoGuard" in setup.json()["meta"]["totp_url"]
        assert not is_mfa_enabled(user)

        # Turning it on needs a recent password confirmation (allauth reauthentication).
        assert (
            post(
                client,
                "/auth/reauthenticate",
                {"password": TEST_PASSWORD},
            ).status_code
            == 200
        )
        wrong = post(client, "/account/authenticators/totp", {"code": "000000"})
        assert wrong.status_code == 400
        assert not is_mfa_enabled(user)

        from allauth.mfa.totp.internal.auth import format_hotp_value  # noqa: PLC0415
        from allauth.mfa.totp.internal.auth import hotp_value  # noqa: PLC0415
        from allauth.mfa.totp.internal.auth import yield_hotp_counters_from_time  # noqa: PLC0415

        secret = setup.json()["meta"]["secret"]
        code = format_hotp_value(
            hotp_value(secret, next(yield_hotp_counters_from_time())),
        )
        assert (
            post(client, "/account/authenticators/totp", {"code": code}).status_code
            == 200
        )
        assert is_mfa_enabled(user)

        # The secret is never shown again.
        after = client.get(f"{AUTH}/account/authenticators/totp")
        assert after.status_code == 200
        assert "secret" not in after.content.decode().lower().replace("totp_url", "")

    def test_secret_is_encrypted_at_rest_when_keys_are_configured(self, settings):
        from nekkoguard.security import crypto  # noqa: PLC0415

        settings.CREDENTIAL_ENCRYPTION_KEYS = [f"t1:{crypto.generate_key()}"]
        settings.CREDENTIAL_ENCRYPTION_ACTIVE_KEY = ""
        crypto.keyring.cache_clear()
        try:
            user = verified_user()
            enable_totp(user)
            RecoveryCodes.activate(user)
            for authenticator in Authenticator.objects.filter(user=user):
                stored = next(iter(authenticator.data.values()))
                assert crypto.is_encrypted(stored)
            # ...and still works.
            client = Client()
            login(client, user.email)
            assert (
                post(
                    client,
                    "/auth/2fa/authenticate",
                    {"code": totp_code(user)},
                ).status_code
                == 200
            )
        finally:
            crypto.keyring.cache_clear()

    def test_sign_in_asks_for_the_code_and_accepts_only_a_valid_one(self):
        user = verified_user()
        enable_totp(user)
        client = Client()
        response = login(client, user.email)
        assert response.status_code == 401
        assert pending_flow(response) == "mfa_authenticate"
        assert not signed_in(client)

        assert (
            post(client, "/auth/2fa/authenticate", {"code": "000000"}).status_code
            == 400
        )
        assert not signed_in(client)

        assert (
            post(
                client,
                "/auth/2fa/authenticate",
                {"code": totp_code(user)},
            ).status_code
            == 200
        )
        assert signed_in(client)

    def test_a_code_cannot_be_used_twice(self):
        user = verified_user()
        enable_totp(user)
        code = totp_code(user)
        first = Client()
        login(first, user.email)
        assert post(first, "/auth/2fa/authenticate", {"code": code}).status_code == 200
        second = Client()
        login(second, user.email)
        assert post(second, "/auth/2fa/authenticate", {"code": code}).status_code == 400
        assert not signed_in(second)

    def test_wrong_codes_are_rate_limited(self, settings):
        settings.ACCOUNT_RATE_LIMITS = {
            **settings.ACCOUNT_RATE_LIMITS,
            "login_failed": "3/m/ip",
        }
        user = verified_user()
        enable_totp(user)
        client = Client()
        login(client, user.email)
        codes = [
            error_codes(post(client, "/auth/2fa/authenticate", {"code": "000000"}))
            for _ in range(5)
        ]
        assert codes[:3] == [{"incorrect_code"}] * 3
        assert codes[3:] == [{"too_many_login_attempts"}] * 2
        # Even the right code is refused while limited.
        response = post(client, "/auth/2fa/authenticate", {"code": totp_code(user)})
        assert error_codes(response) == {"too_many_login_attempts"}
        assert not signed_in(client)

    def test_turning_two_factor_off(self):
        user = verified_user()
        enable_totp(user)
        client = Client()
        login(client, user.email)
        post(client, "/auth/2fa/authenticate", {"code": totp_code(user)})
        # Turning it off asks to confirm the password again first.
        refused = client.delete(f"{AUTH}/account/authenticators/totp")
        assert refused.status_code == 401
        assert {"reauthenticate"} <= {f["id"] for f in refused.json()["data"]["flows"]}
        assert is_mfa_enabled(user)
        assert (
            post(
                client,
                "/auth/reauthenticate",
                {"password": TEST_PASSWORD},
            ).status_code
            == 200
        )
        assert client.delete(f"{AUTH}/account/authenticators/totp").status_code == 200
        assert not is_mfa_enabled(user)


class TestRecoveryCodes:
    def setup_user(self):
        user = verified_user()
        enable_totp(user)
        codes = RecoveryCodes.activate(user).get_unused_codes()
        return user, codes

    def recover(self, user, code):
        client = Client()
        login(client, user.email)
        return client, post(client, "/auth/2fa/authenticate", {"code": code})

    def test_a_recovery_code_signs_in_once(self):
        user, codes = self.setup_user()
        client, response = self.recover(user, codes[0])
        assert response.status_code == 200
        assert signed_in(client)
        client, response = self.recover(user, codes[0])
        assert response.status_code == 400
        assert not signed_in(client)
        # The other codes still work.
        assert self.recover(user, codes[1])[1].status_code == 200

    def test_an_invalid_recovery_code_is_refused(self):
        user, _ = self.setup_user()
        client, response = self.recover(user, "abcd1234")
        assert response.status_code == 400
        assert not signed_in(client)

    def test_codes_are_stored_hashed_not_in_clear(self):
        user, codes = self.setup_user()
        stored = str(
            Authenticator.objects.get(
                user=user,
                type=Authenticator.Type.RECOVERY_CODES,
            ).data,
        )
        assert not any(code in stored for code in codes)

    def test_regenerating_invalidates_the_old_codes(self):
        user, old = self.setup_user()
        client, _ = self.recover(user, old[0])
        post(client, "/auth/reauthenticate", {"password": TEST_PASSWORD})
        response = post(client, "/account/authenticators/recovery-codes")
        assert response.status_code == 200
        new = response.json()["data"]["unused_codes"]
        assert not set(new) & set(old)
        assert self.recover(user, old[1])[1].status_code == 400
        assert self.recover(user, new[0])[1].status_code == 200


# ------------------------------------------------------------------- password reset


class TestPasswordReset:
    def request(self, email):
        return post(Client(), "/auth/password/request", {"email": email})

    @pytest.mark.parametrize(
        "unknown_address",
        ["nobody-here@gmail.com", "nobody@company.example"],
    )
    def test_known_and_unknown_addresses_get_the_same_answer(self, unknown_address):
        user = verified_user()  # address on a domain new sign-ups may not use
        known = self.request(user.email)
        unknown = self.request(unknown_address)
        assert known.status_code == unknown.status_code == 200
        assert known.json() == unknown.json()
        assert len(mail.outbox) >= 1
        assert mail.outbox[0].to == [user.email]

    def test_reset_with_the_emailed_link(self):
        user = verified_user()
        other_device = signed_in_client(user)
        self.request(user.email)
        key = link_key("reset-password")

        client = Client()
        check = client.get(f"{AUTH}/auth/password/reset", HTTP_X_PASSWORD_RESET_KEY=key)
        assert check.status_code == 200
        response = post(
            client,
            "/auth/password/reset",
            {"key": key, "password": NEW_PASSWORD},
        )
        assert response.status_code in {200, 401}  # 401 = done, sign in now

        assert login(Client(), user.email, TEST_PASSWORD).status_code == 400
        assert login(Client(), user.email, NEW_PASSWORD).status_code == 200
        # Sessions opened with the old password are signed out.
        assert not signed_in(other_device)

    def test_the_link_works_only_once(self):
        user = verified_user()
        self.request(user.email)
        key = link_key("reset-password")
        post(Client(), "/auth/password/reset", {"key": key, "password": NEW_PASSWORD})
        again = post(
            Client(),
            "/auth/password/reset",
            {"key": key, "password": "yet-Another-pass-789"},
        )
        assert again.status_code == 400
        assert login(Client(), user.email, NEW_PASSWORD).status_code == 200

    @pytest.mark.parametrize(
        "key",
        ["", "nope", "1-abc-def", "zz-xxxxxx-0123456789abcdef"],
    )
    def test_invalid_link_is_refused(self, key):
        response = post(
            Client(),
            "/auth/password/reset",
            {"key": key, "password": NEW_PASSWORD},
        )
        assert response.status_code == 400

    def test_expired_link_is_refused(self, settings):
        user = verified_user()
        self.request(user.email)
        key = link_key("reset-password")
        settings.PASSWORD_RESET_TIMEOUT = -1  # every link is now too old
        response = post(
            Client(),
            "/auth/password/reset",
            {"key": key, "password": NEW_PASSWORD},
        )
        assert response.status_code == 400
        assert login(Client(), user.email).status_code == 200

    def test_weak_password_is_refused(self):
        user = verified_user()
        self.request(user.email)
        key = link_key("reset-password")
        response = post(
            Client(),
            "/auth/password/reset",
            {"key": key, "password": "password"},
        )
        assert response.status_code == 400
        assert login(Client(), user.email).status_code == 200

    def test_requests_are_rate_limited(self, settings):
        settings.ACCOUNT_RATE_LIMITS = {
            **settings.ACCOUNT_RATE_LIMITS,
            "reset_password": "3/m/ip",
        }
        statuses = [self.request(f"someone{i}@gmail.com").status_code for i in range(5)]
        assert statuses[:3] == [200, 200, 200]
        assert set(statuses[3:]) == {429}


# ------------------------------------------------------------ sign up / verification


class TestSignupAndEmailVerification:
    EMAIL = "brand.new.person@gmail.com"

    def signup(self, client=None, email=EMAIL):
        client = client or Client()
        response = post(
            client,
            "/auth/signup",
            {"email": email, "password": TEST_PASSWORD},
        )
        return client, response

    def test_signup_waits_for_email_verification(self):
        client, response = self.signup()
        assert response.status_code == 401
        assert pending_flow(response) == "verify_email"
        assert not signed_in(client)
        assert not EmailAddress.objects.get(email=self.EMAIL).verified

    def test_the_emailed_link_verifies_the_address(self):
        client, _ = self.signup()
        key = link_key("verify-email")
        info = client.get(
            f"{AUTH}/auth/email/verify",
            HTTP_X_EMAIL_VERIFICATION_KEY=key,
        )
        assert info.status_code == 200
        response = post(client, "/auth/email/verify", {"key": key})
        # Verified, but not signed in (ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION is off):
        # the frontend then asks for the password.
        assert response.status_code == 401
        assert response.json()["meta"]["is_authenticated"] is False
        assert EmailAddress.objects.get(email=self.EMAIL).verified
        assert not signed_in(client)
        assert login(client, self.EMAIL).status_code == 200

    def test_the_link_works_once(self):
        _, _ = self.signup()
        key = link_key("verify-email")
        assert post(Client(), "/auth/email/verify", {"key": key}).status_code in {
            200,
            401,
        }
        assert post(Client(), "/auth/email/verify", {"key": key}).status_code == 400

    @pytest.mark.parametrize("key", ["", "nope", "MQ:1abcde:xyz"])
    def test_invalid_link_is_refused(self, key):
        self.signup()
        assert post(Client(), "/auth/email/verify", {"key": key}).status_code == 400
        assert not EmailAddress.objects.get(email=self.EMAIL).verified

    def test_expired_link_is_refused(self, settings):
        self.signup()
        key = link_key("verify-email")
        settings.ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = -1
        assert post(Client(), "/auth/email/verify", {"key": key}).status_code == 400
        assert not EmailAddress.objects.get(email=self.EMAIL).verified

    def test_resending_the_verification_email_is_rate_limited(self):
        user = verified_user()
        client = signed_in_client(user)
        extra = "second.address@gmail.com"
        assert post(client, "/account/email", {"email": extra}).status_code == 200
        sent = len(mail.outbox)
        # One verification email per address every 3 minutes ("confirm_email").
        resend = client.put(
            f"{AUTH}/account/email",
            {"email": extra},
            content_type="application/json",
        )
        assert resend.status_code == 403
        assert len(mail.outbox) == sent
        cache.clear()  # the 3 minutes are over
        resend = client.put(
            f"{AUTH}/account/email",
            {"email": extra},
            content_type="application/json",
        )
        assert resend.status_code == 200
        assert len(mail.outbox) == sent + 1

    def test_existing_address_signup_does_not_reveal_the_account(self):
        user = verified_user(email="already.here@gmail.com")
        _, existing = self.signup(email=user.email)
        _, fresh = self.signup(email="never.seen@gmail.com")
        # Both look like "check your inbox"; the owner of the address is told by email.
        assert existing.status_code == fresh.status_code == 401
        assert pending_flow(existing) == pending_flow(fresh) == "verify_email"

    def test_signup_is_rate_limited(self, settings):
        settings.ACCOUNT_RATE_LIMITS = {
            **settings.ACCOUNT_RATE_LIMITS,
            "signup": "2/m/ip",
        }
        client = Client()
        statuses = [
            post(
                client,
                "/auth/signup",
                {"email": f"p{i}@gmail.com", "password": TEST_PASSWORD},
            ).status_code
            for i in range(4)
        ]
        assert statuses[:2] == [401, 401]
        assert set(statuses[2:]) == {429}


# ------------------------------------------------------------ active sessions (#11)


class TestSessions:
    def sessions(self, client):
        return client.get(f"{AUTH}/auth/sessions")

    def end(self, client, ids):
        return client.delete(
            f"{AUTH}/auth/sessions",
            {"sessions": ids},
            content_type="application/json",
        )

    def test_requires_sign_in(self):
        assert self.sessions(Client()).status_code == 401
        assert self.end(Client(), [1]).status_code == 401

    def test_lists_own_sessions_with_metadata_but_no_session_keys(self):
        user = verified_user()
        laptop = signed_in_client(user, user_agent="Laptop Firefox")
        signed_in_client(user, user_agent="Phone Safari")
        signed_in_client(verified_user(), user_agent="Someone else")

        response = self.sessions(laptop)
        assert response.status_code == 200
        data = response.json()["data"]
        assert sorted(s["user_agent"] for s in data) == [
            "Laptop Firefox",
            "Phone Safari",
        ]
        current = [s for s in data if s["is_current"]]
        assert [s["user_agent"] for s in current] == ["Laptop Firefox"]
        for session in data:
            assert {"id", "ip", "created_at", "user_agent", "is_current"} <= set(
                session,
            )
        body = response.content.decode()
        for key in UserSession.objects.values_list("session_key", flat=True):
            assert key not in body

    def test_ending_another_session_signs_it_out(self):
        user = verified_user()
        laptop = signed_in_client(user, user_agent="Laptop")
        phone = signed_in_client(user, user_agent="Phone")
        phone_id = next(
            s["id"] for s in self.sessions(laptop).json()["data"] if not s["is_current"]
        )

        response = self.end(laptop, [phone_id])
        assert response.status_code == 200
        assert [s["user_agent"] for s in response.json()["data"]] == ["Laptop"]
        assert not signed_in(phone)
        assert signed_in(laptop)

    def test_ending_all_other_sessions(self):
        user = verified_user()
        clients = [signed_in_client(user, user_agent=f"Device {i}") for i in range(3)]
        current = clients[0]
        others = [
            s["id"]
            for s in self.sessions(current).json()["data"]
            if not s["is_current"]
        ]
        assert len(others) == 2
        assert self.end(current, others).status_code == 200
        assert signed_in(current)
        assert not any(signed_in(c) for c in clients[1:])

    def test_ending_the_current_session_signs_out(self):
        user = verified_user()
        client = signed_in_client(user)
        own = self.sessions(client).json()["data"][0]["id"]
        response = self.end(client, [own])
        assert response.status_code == 401
        assert not signed_in(client)

    def test_cannot_list_or_end_another_users_session(self):
        mine = signed_in_client(verified_user())
        victim_user = verified_user()
        victim = signed_in_client(victim_user)
        victim_id = UserSession.objects.get(user=victim_user).pk
        assert victim_id not in [s["id"] for s in self.sessions(mine).json()["data"]]

        response = self.end(mine, [victim_id])
        assert response.status_code == 400
        assert signed_in(victim)
        assert UserSession.objects.filter(pk=victim_id).exists()

    def test_expired_or_signed_out_sessions_drop_off_the_list(self):
        user = verified_user()
        laptop = signed_in_client(user, user_agent="Laptop")
        old = signed_in_client(user, user_agent="Old")
        Session.objects.filter(
            session_key=old.session.session_key,
        ).delete()  # expired / cleared
        gone = signed_in_client(user, user_agent="Gone")
        gone.delete(f"{AUTH}/auth/session")
        assert [s["user_agent"] for s in self.sessions(laptop).json()["data"]] == [
            "Laptop",
        ]

    def test_password_change_ends_the_other_sessions(self):
        user = verified_user()
        laptop = signed_in_client(user, user_agent="Laptop")
        phone = signed_in_client(user, user_agent="Phone")
        response = post(
            laptop,
            "/account/password/change",
            {"current_password": TEST_PASSWORD, "new_password": NEW_PASSWORD},
            HTTP_USER_AGENT="Laptop",
        )
        assert response.status_code == 200
        assert signed_in(laptop)
        assert not signed_in(phone)
        assert [s["user_agent"] for s in self.sessions(laptop).json()["data"]] == [
            "Laptop",
        ]
