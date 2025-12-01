import {
  BUILD_TIMESTAMP,
  GIT_BRANCH,
  GIT_COMMIT_URL,
  GIT_SHA_SHORT,
} from '../../generated_version';
import { GitHubIcon } from './Icons';

function formatBuildDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export function AboutTab() {
  const buildDate = formatBuildDate(BUILD_TIMESTAMP);

  return (
    <div className="settings-section">
      <div className="settings-about-card">
        <div className="settings-about-icon">🏋️</div>
        <div className="settings-about-title">Swing Analyzer</div>
        <div className="settings-about-subtitle">
          Kettlebell form analysis powered by AI
        </div>
      </div>

      <div className="settings-version-card">
        <div className="settings-version-rows">
          <div className="settings-version-row">
            <span className="settings-version-label">Version</span>
            <a
              href={GIT_COMMIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-version-link"
            >
              {GIT_SHA_SHORT}
            </a>
          </div>
          <div className="settings-version-row">
            <span className="settings-version-label">Branch</span>
            <span className="settings-version-value">{GIT_BRANCH}</span>
          </div>
          <div className="settings-version-row">
            <span className="settings-version-label">Built</span>
            <span className="settings-version-value">{buildDate}</span>
          </div>
        </div>
      </div>

      <div className="settings-links">
        <a
          href="https://github.com/idvorkin/swing-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link"
        >
          <GitHubIcon />
          GitHub
        </a>
        <a
          href="https://idvork.in/kettlebell"
          target="_blank"
          rel="noopener noreferrer"
          className="settings-link"
        >
          📖 Learn More
        </a>
      </div>
    </div>
  );
}
