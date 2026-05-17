from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/health/', include('health.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/visiting/', include('visiting.urls')),
    path('api/language/', include('language.urls')),
    path('api/people/', include('people.urls')),
    path('api/music/', include('music.urls')),
]
