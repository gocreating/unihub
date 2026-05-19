from django.db import models


class Person(models.Model):
    name = models.CharField(max_length=255)
    nickname = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Relationship(models.Model):
    from_person = models.ForeignKey(
        Person, on_delete=models.CASCADE, related_name="relationships_from"
    )
    to_person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="relationships_to")
    kind = models.CharField(max_length=100)  # e.g. "friend", "colleague", "family"
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["from_person", "kind"]
        unique_together = [("from_person", "to_person", "kind")]

    def __str__(self) -> str:
        return f"{self.from_person} —[{self.kind}]→ {self.to_person}"
