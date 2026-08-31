import { useEffect, useState } from "react";
import { resolveAssetUrl } from "../infrastructure/assets/RemoteAssetStore";

interface QuestionImageProps {
  imagePath?: string;
  datasetVersion?: string;
  alt: string;
}

function isDirectUrl(value: string): boolean {
  return /^(?:https?:|data:|blob:|asset:)/i.test(value) || value.startsWith("/");
}

export function QuestionImage({ imagePath, datasetVersion, alt }: QuestionImageProps) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    if (!imagePath) {
      setSrc(undefined);
      return () => {
        active = false;
      };
    }

    if (!datasetVersion || isDirectUrl(imagePath)) {
      setSrc(imagePath);
      return () => {
        active = false;
      };
    }

    setSrc(undefined);
    void resolveAssetUrl(datasetVersion, imagePath)
      .then((resolved) => {
        if (active) setSrc(resolved);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [datasetVersion, imagePath]);

  if (!imagePath) return null;

  return (
    <div className="question-image-frame">
      {src && !failed ? (
        <img src={src} alt={alt} onError={() => setFailed(true)} />
      ) : failed ? (
        <div className="question-image-error" role="status">
          Không thể mở hình minh họa đã tải về máy.
        </div>
      ) : (
        <div className="question-image-loading">Đang mở hình minh họa...</div>
      )}
    </div>
  );
}
