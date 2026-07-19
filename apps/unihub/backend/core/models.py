from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from core.nanoid import generate_id


class AttributeDefinition(models.Model):
    DATA_TYPE_CHOICES = [
        ("text", "Text"),
        ("long_text", "Long Text"),
        ("number", "Number"),
        ("date", "Date"),
        ("boolean", "Boolean"),
        ("single_select", "Single Select"),
        # value + unit from a fixed family, canonical numeric stored for sorting
        ("dimension", "Dimension"),
    ]

    UNIT_FAMILY_CHOICES = [
        ("length", "Length"),
        ("weight", "Weight"),
        ("volume", "Volume"),
        ("temperature", "Temperature"),
        ("time", "Time"),
        ("battery", "Battery capacity"),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    data_type = models.CharField(max_length=20, choices=DATA_TYPE_CHOICES)
    # Required (and only allowed) when data_type == "dimension".
    unit_family = models.CharField(
        max_length=12, choices=UNIT_FAMILY_CHOICES, blank=True, default=""
    )
    is_system = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    options = models.JSONField(default=list, blank=True)
    # Optional display emoji, rendered as a monochrome prefix before the
    # localized key wherever the parameter key appears (FR-032).
    emoji = models.CharField(max_length=8, blank=True, default="")

    class Meta:
        unique_together = [("content_type", "name")]
        ordering = ["display_order", "name"]

    def __str__(self):
        return f"{self.content_type} / {self.name}"


class AttributeValue(models.Model):
    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    attribute_definition = models.ForeignKey(
        AttributeDefinition, on_delete=models.CASCADE, related_name="values"
    )
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=12)
    entity = GenericForeignKey("content_type", "object_id")
    value = models.TextField(blank=True)
    # Entered display unit (dimension values only).
    value_unit = models.CharField(max_length=8, blank=True, default="")
    # Canonical numeric — dimension: family base unit (mm/g/mL/s/mAh/°C);
    # number: the value. For a range value this is the canonical MINIMUM.
    value_number = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    # Canonical range maximum (dimension ranges only); NULL for single values.
    value_number_max = models.DecimalField(
        max_digits=20, decimal_places=4, null=True, blank=True
    )

    class Meta:
        unique_together = [("attribute_definition", "content_type", "object_id")]
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
        ]

    def __str__(self):
        return f"{self.attribute_definition.name}={self.value}"
