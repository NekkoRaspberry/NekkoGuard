from __future__ import annotations

from oauth2_provider.oauth2_validators import OAuth2Validator


class NekkoGuardOAuth2Validator(OAuth2Validator):
    """OpenID Connect claims ("Sign in with NekkoGuard"): email and name."""

    # Claims come with our single "profile" scope (no OIDC email/profile split).
    oidc_claim_scope = None

    def get_additional_claims(self, request):
        user = request.user
        return {"email": user.email, "name": user.name}
