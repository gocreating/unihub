from django.urls import path

from data_io.views import (
    ExportView,
    ImportBatchPreviewView,
    ImportConfirmView,
    ImportPreviewView,
    ImportZipConfirmView,
    ImportZipPreviewView,
    TablesView,
)

urlpatterns = [
    path("tables/", TablesView.as_view(), name="io-tables"),
    path("export/", ExportView.as_view(), name="io-export"),
    path("import/preview/", ImportPreviewView.as_view(), name="io-import-preview"),
    path("import/confirm/", ImportConfirmView.as_view(), name="io-import-confirm"),
    path("import/batch-preview/", ImportBatchPreviewView.as_view(), name="io-import-batch-preview"),
    path("import/zip/preview/", ImportZipPreviewView.as_view(), name="io-import-zip-preview"),
    path("import/zip/confirm/", ImportZipConfirmView.as_view(), name="io-import-zip-confirm"),
]
