# AI RDvD UI — V34

## Timeline ruler alignment fix

- Tách `THỜI GIAN` thành header riêng, không nằm chung hàng với dải mốc thời gian.
- Dải mốc thời gian bắt đầu đúng tại mép trái vùng media, ngay sau track header.
- Playhead đỏ bắt đầu đúng tại cùng tọa độ với mốc `00:00:00:00`.
- Tick của ruler dùng vị trí tuyệt đối theo phần trăm của `timelineRulerDuration`, tránh lệch do CSS grid `auto-fit`.
- Không thay đổi logic zoom 50%-400% đã có ở V33.


V35 correction: timeline ruler duration is now piecewise by zoom so tick marks and playhead share the same time-space at both zoom-out and zoom-in.
