# Adds the Organization permission "members.view" (read-only view of members,
# invitations and permissions) to the override choices. Every role now also holds
# "activity.view"; role permissions live in code (roles.py), so no data changes.

from django.db import migrations
from django.db import models


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0004_remove_owner_role"),
    ]

    operations = [
        migrations.AlterField(
            model_name="permissionoverride",
            name="permission",
            field=models.CharField(
                choices=[
                    ("organization.manage", "organization.manage"),
                    ("members.manage", "members.manage"),
                    ("sites.view", "sites.view"),
                    ("sites.manage", "sites.manage"),
                    ("networks.view", "networks.view"),
                    ("networks.manage", "networks.manage"),
                    ("members.view", "members.view"),
                    ("activity.view", "activity.view"),
                    (
                        "organization.appearance.manage",
                        "organization.appearance.manage",
                    ),
                ],
                max_length=64,
                verbose_name="permission",
            ),
        ),
    ]
