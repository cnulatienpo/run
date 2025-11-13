// Simple session logger stub
export function downloadLog() {
  const sessionData = {
    timestamp: new Date().toISOString(),
    sessionTime: document.getElementById('session-time')?.textContent || '00:00',
    stepCount: document.getElementById('step-count')?.textContent || '0',
    currentTag: document.getElementById('current-tag')?.textContent || 'None'
  };
  
  const dataStr = JSON.stringify(sessionData, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = `session-log-${new Date().toISOString().slice(0,10)}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}