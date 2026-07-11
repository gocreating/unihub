from django.db import models

from core.nanoid import generate_id


class Acquisition(models.Model):
    """A record of how one or more items were obtained (purchase, gift, etc.)."""

    METHOD_CHOICES = [
        ("purchase", "Purchase"),
        ("gift", "Gift"),
        ("transfer", "Transfer"),
        ("found", "Found"),
        ("other", "Other"),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    source = models.CharField(max_length=200, blank=True)  # store, seller, or person
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, blank=True)
    obtained_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    cost = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-obtained_at", "-created_at"]

    def __str__(self) -> str:
        return f"{self.source or 'Acquisition'} ({self.method or 'unknown'})"


class Item(models.Model):
    """An individual physical thing the user owns or consumes. May be a container."""

    TYPE_CHOICES = [
        ("stockable", "Stockable"),
        ("consumable", "Consumable"),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=200)
    item_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="stockable")
    category = models.CharField(max_length=100, blank=True)  # user-defined grouping label
    model = models.CharField(max_length=200, blank=True)
    serial_number = models.CharField(max_length=200, blank=True)
    quantity = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    length = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    width = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    size = models.CharField(max_length=100, blank=True)
    weight = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    price = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    cost = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    purchase_time = models.DateTimeField(null=True, blank=True)
    storage_location = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=30, blank=True)
    acquisition = models.ForeignKey(
        Acquisition,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Scenario(models.Model):
    """A named situation the user prepares a set of items for."""

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ScenarioItem(models.Model):
    """A checklist line: an item required for a scenario, with packing state."""

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="scenario_items")
    required_quantity = models.DecimalField(max_digits=20, decimal_places=4, default=1)
    prepared = models.BooleanField(default=False)
    container = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contained_items",
    )
    notes = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        unique_together = [("scenario", "item")]

    def __str__(self) -> str:
        return f"{self.scenario.name} / {self.item.name}"


class Constraint(models.Model):
    """A packing rule attached to a scenario, evaluated against its selection."""

    TYPE_CHOICES = [
        ("mutual_exclusive", "Mutually exclusive"),
        ("required", "Required"),
        ("weight_limit", "Weight limit"),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name="constraints")
    name = models.CharField(max_length=200, blank=True)
    constraint_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    items = models.ManyToManyField(Item, related_name="constraints", blank=True)
    target_category = models.CharField(max_length=100, blank=True)
    limit_value = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.scenario.name} / {self.constraint_type}"
