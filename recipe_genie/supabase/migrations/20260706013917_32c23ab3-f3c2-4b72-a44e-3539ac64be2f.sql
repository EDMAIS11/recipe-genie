REVOKE EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) TO authenticated;
