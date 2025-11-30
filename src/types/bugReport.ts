export interface BugReportData {
  title: string;
  description: string;
  includeMetadata: boolean;
  screenshot?: string;
}

export interface BugReportMetadata {
  route: string;
  userAgent: string;
  timestamp: string;
  appVersion: string;
}
