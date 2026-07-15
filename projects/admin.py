from django.contrib import admin
from .models import Project, Contributor, Task

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'status', 'location', 'created_at', 'updated_at')
    list_filter = ('status', 'created_at')
    search_fields = ('name', 'description', 'location')

@admin.register(Contributor)
class ContributorAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'joined_on')
    search_fields = ('name', 'email', 'skills')

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'project', 'assigned_to', 'due_date', 'is_completed')
    list_filter = ('is_completed', 'due_date', 'project')
    search_fields = ('title', 'description')
