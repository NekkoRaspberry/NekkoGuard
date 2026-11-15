# Adds Tenant.support_email: where the Tenant's bug reports are emailed
# (empty = the platform address BUG_REPORT_EMAIL).

from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0005_members_view_permission"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="support_email",
            field=models.EmailField(
                blank=True,
                max_length=254,
                verbose_name="support email",
            ),
        ),
    ]
