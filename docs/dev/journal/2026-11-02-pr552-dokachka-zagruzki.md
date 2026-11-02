# Докачка загрузки файлов

02.11 PR #552 (ветка claude/project-thread-19x69r): S3 multipart по частям (флаг files_multipart, выкл), клиент putResumable, abort брошенных, CORS PUT, дизайн в docs/dev/UPLOAD_PIPELINE.md. Тесты: files 182, storage_uploader_test. Нужен Terraform apply CORS (с Mac) и проверка на телефоне, потом включить флаг. SHA: после слияния.
