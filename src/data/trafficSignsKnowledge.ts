export type TrafficSignVisual =
  | "prohibition"
  | "mandatory"
  | "warning"
  | "indication"
  | "supplementary";

export interface TrafficSignKnowledgeGroup {
  id: string;
  title: string;
  shortTitle: string;
  visual: TrafficSignVisual;
  purpose: string;
  recognition: string;
  remember: string;
  examples: string[];
}

export const TRAFFIC_SIGN_KNOWLEDGE_SOURCE = {
  regulation: "QCVN 41:2024/BGTVT",
  article: "Điều 11 - Phân loại biển báo hiệu",
  effectiveFrom: "2025-01-01",
  note: "Hình dạng và màu sắc dưới đây là đặc trưng chủ yếu. Một số biển có ngoại lệ, vì vậy khi áp dụng phải đọc đúng ký hiệu và nội dung của biển cụ thể.",
} as const;

export const trafficSignKnowledgeGroups: TrafficSignKnowledgeGroup[] = [
  {
    id: "prohibition",
    title: "Biển báo cấm",
    shortTitle: "Cấm",
    visual: "prohibition",
    purpose: "Biểu thị các điều cấm mà người tham gia giao thông không được vi phạm.",
    recognition: "Chủ yếu hình tròn, viền đỏ, nền trắng; hình vẽ hoặc chữ/số màu đen thể hiện nội dung cấm.",
    remember: "Nhìn viền đỏ trước tiên: đây thường là nhóm đặt ra giới hạn hoặc hành vi không được thực hiện.",
    examples: ["Cấm một loại phương tiện", "Cấm rẽ hoặc quay đầu", "Hạn chế tốc độ hoặc tải trọng"],
  },
  {
    id: "mandatory",
    title: "Biển hiệu lệnh",
    shortTitle: "Hiệu lệnh",
    visual: "mandatory",
    purpose: "Báo hiệu lệnh mà người tham gia giao thông phải chấp hành, trừ các trường hợp đặc biệt được quy chuẩn quy định riêng.",
    recognition: "Chủ yếu hình tròn, nền xanh lam, hình vẽ màu trắng thể hiện hướng đi hoặc hành vi phải thực hiện.",
    remember: "Nền xanh tròn thường mang nghĩa phải làm theo, khác với nhóm cấm là không được làm.",
    examples: ["Hướng phải đi", "Đường dành cho đối tượng nhất định", "Yêu cầu thực hiện theo hướng tổ chức giao thông"],
  },
  {
    id: "warning",
    title: "Biển báo nguy hiểm và cảnh báo",
    shortTitle: "Nguy hiểm",
    visual: "warning",
    purpose: "Báo trước nguy hiểm hoặc tình huống cần chú ý để người tham gia giao thông chủ động phòng ngừa.",
    recognition: "Chủ yếu hình tam giác đều, viền đỏ, nền vàng, hình vẽ màu đen mô tả nguy hiểm cần cảnh báo.",
    remember: "Tam giác viền đỏ là tín hiệu cần giảm mức chủ quan: quan sát và chuẩn bị xử lý tình huống phía trước.",
    examples: ["Đường giao nhau", "Đường cong hoặc địa hình nguy hiểm", "Người đi bộ, công trường hoặc chướng ngại"],
  },
  {
    id: "indication",
    title: "Biển chỉ dẫn",
    shortTitle: "Chỉ dẫn",
    visual: "indication",
    purpose: "Cung cấp thông tin và các chỉ dẫn cần thiết giúp người tham gia giao thông lựa chọn hướng đi và sử dụng đường đúng cách.",
    recognition: "Chủ yếu hình chữ nhật, hình vuông hoặc hình mũi tên; nền xanh là đặc trưng phổ biến.",
    remember: "Nhóm này thiên về cung cấp thông tin: hướng đi, vị trí, làn đường, địa điểm hoặc điều kiện sử dụng đường.",
    examples: ["Hướng đi và địa danh", "Làn đường", "Vị trí dịch vụ hoặc khu vực cần biết"],
  },
  {
    id: "supplementary",
    title: "Biển phụ, biển viết bằng chữ",
    shortTitle: "Biển phụ",
    visual: "supplementary",
    purpose: "Thuyết minh, bổ sung nội dung cho các nhóm biển chính hoặc được sử dụng độc lập khi cần truyền đạt thông tin bằng chữ.",
    recognition: "Thường là bảng chữ nhật đặt kèm biển chính; nội dung có thể mô tả phạm vi, thời gian, đối tượng hoặc hướng tác dụng.",
    remember: "Không đọc biển phụ tách rời nếu nó đi cùng biển chính; ý nghĩa đầy đủ thường là tổ hợp của cả hai.",
    examples: ["Khoảng cách đến vị trí tác dụng", "Thời gian hoặc phạm vi áp dụng", "Đối tượng hoặc hướng tác dụng của biển chính"],
  },
];
