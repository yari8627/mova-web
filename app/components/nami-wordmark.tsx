import styles from "./trip-header.module.css";

// Reuse the approved trip-header wordmark, including its typography/proportions.
export function NamiWordmark() {
  return <div className={styles.wordmarkButton} aria-label="NAMI Travel" style={{ cursor: "default" }}>
    <span>NAMI</span><small>TRAVEL</small>
  </div>;
}
