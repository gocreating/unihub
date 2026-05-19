from django.urls import path

from data_io.views import ExportView, ImportConfirmView, ImportPreviewView, TablesView

urlpatterns = [
    path("tables/", TablesView.as_view(), name="io-tables"),
    path("export/", ExportView.as_view(), name="io-export"),
    path("import/preview/", ImportPreviewView.as_view(), name="io-import-preview"),
    path("import/confirm/", ImportConfirmView.as_view(), name="io-import-confirm"),
]
