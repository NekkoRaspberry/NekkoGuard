# Removes the Owner role (Tenant and Organization). Administrator is now the highest
# role; anything above it is for superusers. Existing owners become administrators,
# so nobody loses access.

from django.db import migrations, models


def owners_to_admins(apps, schema_editor):
    TenantMembership = apps.get_model("organizations", "TenantMembership")
    OrganizationMembership = apps.get_model("organizations", "OrganizationMembership")
    OrganizationInvitation = apps.get_model("organizations", "OrganizationInvitation")
    TenantMembership.objects.filter(role="owner").update(role="admin")
    TenantMembership.objects.filter(default_organization_role="owner").update(
        default_organization_role="admin",
    )
    OrganizationMembership.objects.filter(role="owner").update(role="admin")
    OrganizationInvitation.objects.filter(role="owner").update(role="admin")


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0003_organization_invitation"),
    ]

    operations = [
        # One-way: once merged, nobody can tell former owners from administrators.
        migrations.RunPython(owners_to_admins, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organizationinvitation",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Organization Administrator"),
                    ("security_analyst", "Security Analyst"),
                    ("operator", "Operator"),
                    ("viewer", "Viewer"),
                ],
                default="viewer",
                max_length=32,
                verbose_name="organization role",
            ),
        ),
        migrations.AlterField(
            model_name="organizationmembership",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Organization Administrator"),
                    ("security_analyst", "Security Analyst"),
                    ("operator", "Operator"),
                    ("viewer", "Viewer"),
                ],
                max_length=32,
                verbose_name="organization role",
            ),
        ),
        migrations.AlterField(
            model_name="tenantmembership",
            name="default_organization_role",
            field=models.CharField(
                blank=True,
                choices=[
                    ("admin", "Organization Administrator"),
                    ("security_analyst", "Security Analyst"),
                    ("operator", "Operator"),
                    ("viewer", "Viewer"),
                ],
                help_text="Permissions inherited in the Organizations this user reaches.",
                max_length=32,
                verbose_name="default organization role",
            ),
        ),
        migrations.AlterField(
            model_name="tenantmembership",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Tenant Administrator"),
                    ("member", "Tenant Member"),
                ],
                max_length=32,
                verbose_name="tenant role",
            ),
        ),
    ]
