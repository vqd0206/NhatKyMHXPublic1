# Mô hình dữ liệu

Một `campaign` đại diện cho một mùa/địa điểm Mùa Hè Xanh. Mỗi chiến dịch có nhiều `journals`. Mỗi nhật ký có nội dung chính, nhiều bản ghi `journal_media` và một luồng `comments`.

Bình luận có tài khoản dùng `user_id`; khách có thể để tên hoặc chọn `is_anonymous`. Trạng thái mặc định là `pending` để tránh nội dung xấu hiển thị ngay. Chỉ bình luận `approved` được đưa lên trang công khai.

Các tệp JSON trong `data/` là nguồn dữ liệu demo cho bản HTML tĩnh. Khi có backend, lớp `assets/js/api.js` sẽ gọi API nhưng giữ nguyên cấu trúc hiển thị phía trình duyệt.
