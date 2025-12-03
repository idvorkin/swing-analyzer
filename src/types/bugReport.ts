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
  // Device details
  screen: string;
  deviceMemory: string;
  cpuCores: string;
  onlineStatus: string;
  connectionType: string;
  displayMode: string;
  touchDevice: string;
  mobile: string;
}
