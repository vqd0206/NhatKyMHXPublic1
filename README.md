# Nhật ký Mùa Hè Xanh - Tạp chí tương tác

Website HTML/CSS/JavaScript mô phỏng phong cách ấn phẩm Mùa Hè Xanh: nền giấy xanh, minh họa thủ công, trang viết tay, album ảnh và lời nhắn của độc giả.

## Chạy dự án

Yêu cầu Node.js 18 trở lên. Không cần cài thư viện và không dùng MySQL.

```powershell
npm start
```

Sau đó mở `http://localhost:3000`.

Không mở trực tiếp `index.html` bằng cách nhấp đúp vì các chức năng ghi JSON và tải ảnh cần máy chủ Node.js đi kèm.
Chỉ chạy một phiên bản máy chủ trên cổng 3000; các trang ở cổng cũ có thể không có API mới nhất.

## Chức năng

- Trang chủ hiển thị nhiều trang nhật ký.
- Trang đọc mô phỏng ba phần của bản giấy: bìa, trang viết và trang ảnh.
- Thư viện hỗ trợ tối đa 20 mục ảnh/video, xem ảnh phóng lớn và phát video ngay trên trang.
- Có thể nhúng video YouTube hoặc Google Drive; các video nhúng vẫn được tính trong giới hạn 20 mục.
- Có thư viện ảnh/video chung tại trang chủ, tách biệt hoàn toàn với album của từng nhật ký.
- Nút xem bản in điện tử nằm trên thanh đầu trang và mã QR truy cập PDF nằm ở cuối trang.
- `/write.html` là trang công khai để mọi người đăng hoặc chỉnh sửa nhật ký bằng link riêng.
- `/admin.html` yêu cầu mật khẩu để quản lý trạng thái nhật ký, bình luận, thư viện chung, link sửa và link bản in.
- Bình luận có tên hoặc ẩn danh, hiển thị ngay sau khi gửi.
- Trang `/write.html` dùng TinyMCE 8 qua CDN để soạn nội dung có định dạng.
- TinyMCE dán nội dung ở chế độ văn bản thuần để tránh vô tình lưu toàn bộ DOM của Google Forms hoặc một trang web khác.
- Tạo nhật ký mới với tối đa 20 tệp: JPG/PNG/WebP dưới 8 MB hoặc MP4/WebM dưới 20 MB.
- Responsive cho máy tính, máy tính bảng và điện thoại.
- Escape dữ liệu do người dùng nhập và giới hạn loại/kích thước ảnh.

## Lưu trữ JSON

Tất cả dữ liệu được lưu trong:

- `data/campaigns.json`: thông tin chiến dịch.
- `data/journals.json`: nội dung các trang nhật ký.
- `data/media.json`: đường dẫn và mô tả ảnh.
- `data/comments.json`: bình luận.
- `assets/images/uploads/`: tệp ảnh người dùng tải lên.

Máy chủ ghi JSON theo cách tạo tệp tạm rồi đổi tên để hạn chế tệp dữ liệu bị hỏng nếu quá trình ghi bị gián đoạn.

## Cấu trúc chính

```text
├── index.html                 # Trang chủ
├── journal.html               # Trang đọc nhật ký
├── admin.html                 # Trang tạo nhật ký
├── server.js                  # Máy chủ và API JSON, không dùng thư viện ngoài
├── package.json
├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   ├── js/journal.js
│   ├── js/admin.js
│   └── images/
└── data/
    ├── campaigns.json
    ├── journals.json
    ├── media.json
    └── comments.json
```

## Lưu ý khi đưa lên Internet

JSON phù hợp cho dự án nhỏ hoặc lượng người ghi dữ liệu không quá cao. Trước khi công khai rộng rãi nên bổ sung đăng nhập quản trị, CAPTCHA/chống spam, sao lưu định kỳ và hàng đợi ghi dữ liệu. Không triển khai trên dịch vụ hosting chỉ đọc tệp hoặc môi trường serverless không có ổ đĩa bền vững.

Mật khẩu quản trị mặc định là `MHX2025@Admin`. Khi triển khai, hãy đặt biến môi trường `ADMIN_PASSWORD` thành mật khẩu riêng và sử dụng HTTPS.

Thư mục `database/` là bản thiết kế SQL từ giai đoạn đầu và không được ứng dụng hiện tại sử dụng; có thể giữ làm phương án nâng cấp sau này.
