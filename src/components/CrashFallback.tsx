import { GIT_COMMIT_URL, GIT_SHA_SHORT } from '../generated_version';
import {
  buildCrashReportBody,
  buildGitHubIssueUrl,
  getMetadata,
} from '../utils/bugReportFormatters';

const GITHUB_REPO_URL = 'https://github.com/idvorkin/swing-analyzer';

export function CrashFallback({ error }: { error: Error }) {
  const metadata = getMetadata(
    () => window.location.pathname,
    () => navigator.userAgent
  );
  const reportUrl = buildGitHubIssueUrl(
    GITHUB_REPO_URL,
    `Crash: ${error.message.slice(0, 50)}`,
    buildCrashReportBody(error, metadata),
    ['bug', 'crash']
  );

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#111827',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        overflow: 'auto',
      }}
    >
      <div style={{ maxWidth: '42rem', textAlign: 'center' }}>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#f87171',
            marginBottom: '1rem',
          }}
        >
          Something went wrong
        </h1>
        <p style={{ color: '#d1d5db', marginBottom: '1rem' }}>
          {error.message}
        </p>
        {error.stack && (
          <pre
            style={{
              textAlign: 'left',
              fontSize: '0.75rem',
              color: '#9ca3af',
              backgroundColor: '#1f2937',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              overflow: 'auto',
              maxHeight: '16rem',
            }}
          >
            {error.stack}
          </pre>
        )}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#374151',
              color: 'white',
              borderRadius: '0.5rem',
              textDecoration: 'none',
            }}
          >
            Report on GitHub
          </a>
        </div>
        <p
          style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}
        >
          Build:{' '}
          <a
            href={GIT_COMMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#60a5fa' }}
          >
            {GIT_SHA_SHORT}
          </a>
        </p>
      </div>
    </div>
  );
}
