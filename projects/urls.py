from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, ContributorViewSet, TaskViewSet
from .views_auth import (
    auth_login, auth_logout, auth_me, 
    auth_change_temp_password, auth_forgot_password, auth_update_settings,
    AdminViewSet
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'contributors', ContributorViewSet, basename='contributor')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'admins', AdminViewSet, basename='admin')

urlpatterns = [
    path('auth/login/', auth_login, name='auth_login'),
    path('auth/logout/', auth_logout, name='auth_logout'),
    path('auth/me/', auth_me, name='auth_me'),
    path('auth/change-temp-password/', auth_change_temp_password, name='auth_change_temp_password'),
    path('auth/forgot-password/', auth_forgot_password, name='auth_forgot_password'),
    path('auth/settings/', auth_update_settings, name='auth_update_settings'),
    path('', include(router.urls)),
]
