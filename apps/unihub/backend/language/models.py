from django.db import models


class Language(models.Model):
    name = models.CharField(max_length=100)          # e.g. "Japanese", "Spanish"
    code = models.CharField(max_length=10, unique=True)  # ISO 639-1, e.g. "ja", "es"
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class WordCard(models.Model):
    language = models.ForeignKey(Language, on_delete=models.CASCADE, related_name='word_cards')
    word = models.CharField(max_length=255)
    translation = models.CharField(max_length=255)
    romanization = models.CharField(max_length=255, blank=True)  # romaji, pinyin, etc.
    example = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['word']

    def __str__(self) -> str:
        return f'{self.word} ({self.language.code})'


class GrammarSheet(models.Model):
    language = models.ForeignKey(Language, on_delete=models.CASCADE, related_name='grammar_sheets')
    title = models.CharField(max_length=255)
    content = models.TextField()  # Markdown
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['language', 'title']

    def __str__(self) -> str:
        return f'{self.title} ({self.language.code})'
