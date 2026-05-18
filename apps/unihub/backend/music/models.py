from django.db import models


class Song(models.Model):
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    album = models.CharField(max_length=255, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    genre = models.CharField(max_length=100, blank=True)
    language = models.CharField(max_length=100, blank=True)
    rating = models.PositiveSmallIntegerField(null=True, blank=True)  # 1–5
    notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["artist", "title"]

    def __str__(self) -> str:
        return f"{self.title} — {self.artist}"
