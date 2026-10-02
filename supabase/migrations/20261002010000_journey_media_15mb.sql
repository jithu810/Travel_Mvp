-- Increase cover and stop image limits without changing tables or RLS.
update storage.buckets set file_size_limit = 15728640 where id = 'journey-media';
