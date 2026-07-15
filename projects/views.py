from rest_framework import viewsets
from rest_framework.response import Response
from django.core.cache import cache
import hashlib
from .models import Project, Contributor, Task
from .serializers import ProjectSerializer, ContributorSerializer, TaskSerializer
from datetime import date

class CacheResponseMixin:
    """
    A mixin to cache list and retrieve operations dynamically based on request parameters.
    """
    cache_prefix = ""

    def get_cache_key(self, request, pk=None):
        if pk:
            return f"{self.cache_prefix}_detail_{pk}"
        # For list views, hash sorted query parameters to respect paging and filters
        query_params = sorted(request.query_params.items())
        params_str = "&".join([f"{k}={v}" for k, v in query_params])
        hash_val = hashlib.md5(params_str.encode('utf-8')).hexdigest()
        return f"{self.cache_prefix}_list_{hash_val}"

    def list(self, request, *args, **kwargs):
        cache_key = self.get_cache_key(request)
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)

        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, timeout=900)  # cache for 15 minutes
        return response

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = self.get_cache_key(request, pk=pk)
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            return Response(cached_data)

        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, timeout=900)  # cache for 15 minutes
        return response


class ProjectViewSet(CacheResponseMixin, viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Projects.
    Supports filtering by status (e.g. ?status=Active).
    """
    serializer_class = ProjectSerializer
    cache_prefix = "project"

    def get_queryset(self):
        queryset = Project.objects.all().order_by('-created_at')
        status = self.request.query_params.get('status', None)
        if status:
            queryset = queryset.filter(status=status)
        return queryset


class ContributorViewSet(CacheResponseMixin, viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Contributors.
    """
    serializer_class = ContributorSerializer
    queryset = Contributor.objects.all().order_by('-joined_on')
    cache_prefix = "contributor"


class TaskViewSet(CacheResponseMixin, viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Tasks.
    Supports filtering by contributor ID (?contributor=<id>) and overdue status (?overdue=true).
    """
    serializer_class = TaskSerializer
    cache_prefix = "task"

    def get_queryset(self):
        queryset = Task.objects.all().order_by('due_date')
        
        # Filter by contributor
        contributor = self.request.query_params.get('contributor', None)
        if contributor:
            queryset = queryset.filter(assigned_to_id=contributor)
        
        # Filter by overdue status
        overdue = self.request.query_params.get('overdue', None)
        if overdue is not None:
            if overdue.lower() == 'true':
                queryset = queryset.filter(is_completed=False, due_date__lt=date.today())
            elif overdue.lower() == 'false':
                queryset = queryset.exclude(is_completed=False, due_date__lt=date.today())
                
        return queryset
