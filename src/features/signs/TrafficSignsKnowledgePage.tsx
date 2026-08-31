import { useEffect, useMemo, useState } from "react";
import type { AppSection } from "../../app/navigation";
import {
  TRAFFIC_SIGN_KNOWLEDGE_SOURCE,
  trafficSignKnowledgeGroups,
} from "../../data/trafficSignsKnowledge";
import type { TrafficSignGroupCode } from "../../domain/entities/trafficSign";
import type { DatasetBootstrapStatus } from "../../infrastructure/database/DatasetBootstrap";
import type { TrafficSignsBootstrapStatus } from "../../infrastructure/database/TrafficSignsBootstrap";
import {
  SqliteTrafficSignsRepository,
  type TrafficSignCatalogItem,
} from "../../infrastructure/repositories/SqliteTrafficSignsRepository";

interface TrafficSignsKnowledgePageProps {
  datasetStatus: DatasetBootstrapStatus;
  trafficSignsStatus: TrafficSignsBootstrapStatus;
  onNavigate: (section: AppSection) => void;
  onRetryTrafficSigns: () => void;
}

const repository = new SqliteTrafficSignsRepository();
const PAGE_SIZE = 48;

const GROUP_FILTERS: Array<{ code?: TrafficSignGroupCode; label: string }> = [
  { label: "Tất cả" },
  { code: "PROHIBITION", label: "Cấm" },
  { code: "MANDATORY", label: "Hiệu lệnh" },
  { code: "WARNING", label: "Nguy hiểm" },
  { code: "INDICATION", label: "Chỉ dẫn" },
  { code: "SUPPLEMENTARY", label: "Biển phụ" },
];

export function TrafficSignsKnowledgePage({
  datasetStatus,
  trafficSignsStatus: signsStatus,
  onNavigate,
  onRetryTrafficSigns: retrySigns,
}: TrafficSignsKnowledgePageProps) {
  const questionsReady = datasetStatus.state === "ready";
  const [groupCode, setGroupCode] = useState<TrafficSignGroupCode>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<TrafficSignCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const catalogIdentity = signsStatus.state === "ready"
    ? `ready:${signsStatus.version}`
    : signsStatus.state;

  useEffect(() => {
    setPage(0);
  }, [groupCode, search, catalogIdentity]);

  useEffect(() => {
    let active = true;
    if (signsStatus.state !== "ready") {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(undefined);
    const timer = window.setTimeout(() => {
      void repository
        .list({ groupCode, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        .then((result) => {
          if (!active) return;
          setItems(result.items);
          setTotal(result.total);
        })
        .catch((loadError) => {
          if (!active) return;
          setItems([]);
          setTotal(0);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [groupCode, page, search, signsStatus]);

  const signsStatusLabel = useMemo(() => {
    switch (signsStatus.state) {
      case "checking":
        return "Đang kiểm tra catalog biển báo";
      case "browser":
        return "Browser preview: chưa dùng catalog native";
      case "not-configured":
        return "Chưa cấu hình dataset biển báo";
      case "error":
        return "Không thể tải dataset biển báo";
      case "ready":
        return `${signsStatus.signCount} biển · version ${signsStatus.version}${signsStatus.offline ? " · offline" : ""}`;
    }
  }, [signsStatus]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total > 0 ? page * PAGE_SIZE + 1 : 0;
  const rangeEnd = total > 0 ? Math.min((page + 1) * PAGE_SIZE, total) : 0;

  return (
    <div className="page traffic-signs-page">
      <section className="traffic-signs-hero">
        <div>
          <span className="eyebrow">Kiến thức nền</span>
          <h1>Nhận biết và tra cứu biển báo giao thông</h1>
          <p>
            Phần 5 nhóm kiến thức được tích hợp sẵn trong app. Catalog từng biển là một dataset
            độc lập với bộ 600 câu và có version, checksum, ảnh và vòng đời cập nhật riêng.
          </p>
          <div className="traffic-signs-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("learning")}>
              {questionsReady ? "Mở catalog 600 câu" : "Mở phần học 600 câu"}
            </button>
            {(signsStatus.state === "not-configured" || signsStatus.state === "error") && (
              <button className="secondary-button" type="button" onClick={retrySigns}>
                Kiểm tra dataset biển báo
              </button>
            )}
          </div>
        </div>
        <div className="traffic-signs-source-card">
          <span>Nguồn kiến thức nhóm</span>
          <strong>{TRAFFIC_SIGN_KNOWLEDGE_SOURCE.regulation}</strong>
          <small>{TRAFFIC_SIGN_KNOWLEDGE_SOURCE.article}</small>
          <small>Hiệu lực từ 01/01/2025</small>
          <div className={`traffic-signs-dataset ${signsStatus.state === "ready" ? "ready" : "pending"}`}>
            {signsStatusLabel}
          </div>
        </div>
      </section>

      {signsStatus.state === "ready" && signsStatus.warning && (
        <div className="data-warning" role="status">{signsStatus.warning}</div>
      )}
      {signsStatus.state === "error" && (
        <div className="data-warning" role="status">
          Catalog từng biển chưa khả dụng. Phần kiến thức 5 nhóm bên dưới vẫn hoạt động offline.
          <small>{signsStatus.message}</small>
        </div>
      )}
      {error && (
        <div className="data-warning" role="status">
          Không thể đọc catalog biển báo từ SQLite.
          <small>{error}</small>
        </div>
      )}

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
                <div><dt>Nhận biết</dt><dd>{group.recognition}</dd></div>
                <div><dt>Ghi nhớ</dt><dd>{group.remember}</dd></div>
              </dl>
              <div className="traffic-sign-examples">
                <strong>Ví dụ nội dung thường gặp</strong>
                <ul>{group.examples.map((example) => <li key={example}>{example}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block traffic-sign-catalog-section">
        <div className="catalog-question-toolbar">
          <div>
            <span className="eyebrow">Catalog độc lập</span>
            <h2>Tra cứu từng biển báo</h2>
            <p>{signsStatus.state === "ready" ? `${total} biển phù hợp` : "Catalog sẽ xuất hiện sau khi traffic-signs dataset được publish và tải lần đầu."}</p>
          </div>
          <input
            className="traffic-sign-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm mã biển, tên hoặc ý nghĩa..."
            disabled={signsStatus.state !== "ready"}
          />
        </div>

        <div className="catalog-filters traffic-sign-filters" aria-label="Lọc nhóm biển báo">
          {GROUP_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.code ?? "all"}
              className={groupCode === filter.code ? "active" : ""}
              onClick={() => setGroupCode(filter.code)}
              disabled={signsStatus.state !== "ready"}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {signsStatus.state !== "ready" ? (
          <div className="catalog-empty-state">
            <strong>Dataset biển báo chưa được cài.</strong>
            <p>Cấu hình `VITE_TRAFFIC_SIGNS_MANIFEST_URL`, publish `traffic-signs.json` và asset package riêng để kích hoạt catalog này.</p>
          </div>
        ) : loading ? (
          <div className="catalog-empty-state">Đang tải catalog biển báo...</div>
        ) : items.length === 0 ? (
          <div className="catalog-empty-state">Không tìm thấy biển phù hợp.</div>
        ) : (
          <>
            <div className="traffic-sign-catalog-grid">
              {items.map((sign) => (
                <article className="traffic-sign-detail-card" key={sign.code}>
                  <div className="traffic-sign-detail-image">
                    {sign.imageUrl ? <img src={sign.imageUrl} alt={`Biển ${sign.code} - ${sign.name}`} /> : <span>{sign.code}</span>}
                  </div>
                  <div className="traffic-sign-detail-body">
                    <div className="traffic-sign-detail-title">
                      <span>{sign.code}</span>
                      <strong>{sign.name}</strong>
                    </div>
                    <p>{sign.meaning}</p>
                    {sign.recognition && <small><b>Nhận biết:</b> {sign.recognition}</small>}
                    {sign.scope && <small><b>Phạm vi:</b> {sign.scope}</small>}
                    {sign.exceptions.length > 0 && <small><b>Ngoại lệ:</b> {sign.exceptions.join("; ")}</small>}
                    {sign.notes && <small><b>Lưu ý:</b> {sign.notes}</small>}
                    <small className="traffic-sign-source"><b>Nguồn:</b> {sign.sourceVersion}</small>
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="traffic-sign-pagination" aria-label="Phân trang catalog biển báo">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Trang trước
                </button>
                <span>
                  {rangeStart}–{rangeEnd}/{total} · Trang {page + 1}/{totalPages}
                </span>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                >
                  Trang sau
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      <section className="traffic-signs-note">
        <div>
          <span className="eyebrow">Lưu ý</span>
          <h2>Hai dataset không suy diễn lẫn nhau</h2>
        </div>
        <p>{TRAFFIC_SIGN_KNOWLEDGE_SOURCE.note}</p>
        <p>
          Catalog biển báo dùng để học và tra cứu. Đáp án trong bộ 600 câu vẫn phải đến từ
          dataset 600 câu đã xác minh, không được tự suy ra từ catalog biển báo.
        </p>
      </section>
    </div>
  );
}
