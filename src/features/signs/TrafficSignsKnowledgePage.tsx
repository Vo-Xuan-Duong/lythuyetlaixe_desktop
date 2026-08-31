import type { AppSection } from "../../app/navigation";
import {
  TRAFFIC_SIGN_KNOWLEDGE_SOURCE,
  trafficSignKnowledgeGroups,
} from "../../data/trafficSignsKnowledge";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";

interface TrafficSignsKnowledgePageProps {
  datasetStatus: DatasetBootstrapStatus;
  onNavigate: (section: AppSection) => void;
}

export function TrafficSignsKnowledgePage({
  datasetStatus,
  onNavigate,
}: TrafficSignsKnowledgePageProps) {
  const datasetReady = datasetStatus.state === "ready";

  return (
    <div className="page traffic-signs-page">
      <section className="traffic-signs-hero">
        <div>
          <span className="eyebrow">Kiến thức nền</span>
          <h1>Nhận biết 5 nhóm biển báo giao thông</h1>
          <p>
            Học theo mục đích, hình dạng và màu sắc đặc trưng để phân loại nhanh trước khi đi vào
            từng biển cụ thể. Nội dung phần này bám theo {TRAFFIC_SIGN_KNOWLEDGE_SOURCE.regulation}.
          </p>
          <div className="traffic-signs-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("learning")}>
              Mở catalog 600 câu
            </button>
            <span className={`traffic-signs-dataset ${datasetReady ? "ready" : "pending"}`}>
              {datasetReady ? `Dataset ${datasetStatus.version} sẵn sàng` : "Kiến thức này dùng được ngay cả khi chưa có dataset"}
            </span>
          </div>
        </div>
        <div className="traffic-signs-source-card">
          <span>Nguồn quy chuẩn</span>
          <strong>{TRAFFIC_SIGN_KNOWLEDGE_SOURCE.regulation}</strong>
          <small>{TRAFFIC_SIGN_KNOWLEDGE_SOURCE.article}</small>
          <small>Hiệu lực từ 01/01/2025</small>
        </div>
      </section>

      <section className="traffic-signs-summary" aria-label="Ghi nhớ nhanh">
        <article><strong>5</strong><span>nhóm biển cơ bản</span></article>
        <article><strong>Đỏ</strong><span>thường gợi cấm hoặc cảnh báo</span></article>
        <article><strong>Xanh</strong><span>thường gợi hiệu lệnh hoặc chỉ dẫn</span></article>
        <article><strong>Đọc cùng nhau</strong><span>khi có biển phụ đi kèm</span></article>
      </section>

      <section className="section-block">
        <div className="section-heading traffic-signs-heading">
          <div>
            <span className="eyebrow">Phân loại</span>
            <h2>5 nhóm theo QCVN 41:2024/BGTVT</h2>
          </div>
        </div>

        <div className="traffic-sign-groups">
          {trafficSignKnowledgeGroups.map((group, index) => (
            <article className="traffic-sign-card" key={group.id}>
              <div className="traffic-sign-card-top">
                <div className={`traffic-sign-symbol ${group.visual}`} aria-hidden="true">
                  <span>{group.visual === "warning" ? "!" : group.visual === "supplementary" ? "A" : ""}</span>
                </div>
                <div>
                  <span className="traffic-sign-index">0{index + 1}</span>
                  <h3>{group.title}</h3>
                </div>
              </div>

              <p className="traffic-sign-purpose">{group.purpose}</p>

              <dl className="traffic-sign-facts">
                <div>
                  <dt>Nhận biết</dt>
                  <dd>{group.recognition}</dd>
                </div>
                <div>
                  <dt>Ghi nhớ</dt>
                  <dd>{group.remember}</dd>
                </div>
              </dl>

              <div className="traffic-sign-examples">
                <strong>Ví dụ nội dung thường gặp</strong>
                <ul>
                  {group.examples.map((example) => <li key={example}>{example}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="traffic-signs-note">
        <div>
          <span className="eyebrow">Lưu ý</span>
          <h2>Không suy luận chỉ bằng màu hoặc hình dạng</h2>
        </div>
        <p>{TRAFFIC_SIGN_KNOWLEDGE_SOURCE.note}</p>
        <p>
          Khi bộ 600 câu production được cài, hãy kết hợp phần kiến thức này với nhóm câu
          <strong> Báo hiệu đường bộ (301–485)</strong> để luyện nhận dạng trong ngữ cảnh sát hạch.
        </p>
      </section>
    </div>
  );
}
