import { useState } from "react";
import { demoQuestion } from "../../data/demo";

export function LearningPage() {
  const [selectedAnswer, setSelectedAnswer] = useState<string>();
  const [checked, setChecked] = useState(false);

  const selected = demoQuestion.answers.find((answer) => answer.key === selectedAnswer);

  const reset = () => {
    setSelectedAnswer(undefined);
    setChecked(false);
  };

  return (
    <div className="page learning-page">
      <div className="section-heading learning-heading">
        <div>
          <span className="eyebrow">Chế độ học</span>
          <h1>Câu {demoQuestion.id} / 600</h1>
        </div>
        <div className="question-tags">
          <span>Quy tắc giao thông</span>
          <span className="demo-tag">Dữ liệu demo</span>
        </div>
      </div>

      <div className="learning-layout">
        <section className="question-card">
          <div className="question-meta">
            <span>Câu hỏi</span>
            <button type="button" className="bookmark-button" aria-label="Đánh dấu câu hỏi">☆</button>
          </div>

          <h2>{demoQuestion.content}</h2>

          <div className="answer-list">
            {demoQuestion.answers.map((answer) => {
              const isSelected = answer.key === selectedAnswer;
              const state = checked
                ? answer.correct
                  ? "correct"
                  : isSelected
                    ? "wrong"
                    : ""
                : isSelected
                  ? "selected"
                  : "";

              return (
                <button
                  key={answer.key}
                  type="button"
                  className={`answer-option ${state}`}
                  disabled={checked}
                  onClick={() => setSelectedAnswer(answer.key)}
                >
                  <span className="answer-key">{answer.key}</span>
                  <span>{answer.content}</span>
                </button>
              );
            })}
          </div>

          {!checked ? (
            <button
              className="primary-button check-button"
              disabled={!selectedAnswer}
              onClick={() => setChecked(true)}
              type="button"
            >
              Kiểm tra đáp án
            </button>
          ) : (
            <div className={`answer-feedback ${selected?.correct ? "success" : "danger"}`}>
              <strong>{selected?.correct ? "Chính xác" : "Chưa chính xác"}</strong>
              <p>{demoQuestion.explanation}</p>
            </div>
          )}
        </section>

        <aside className="question-side-panel">
          <span className="eyebrow">Phiên học</span>
          <h3>Tiến độ chủ đề</h3>
          <div className="side-progress"><i /></div>
          <dl>
            <div><dt>Đã làm</dt><dd>0</dd></div>
            <div><dt>Đúng</dt><dd>0</dd></div>
            <div><dt>Sai</dt><dd>0</dd></div>
            <div><dt>Mastery</dt><dd>0 / 4</dd></div>
          </dl>
          {checked && (
            <button className="secondary-button full-width" onClick={reset} type="button">
              Làm lại câu demo
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
