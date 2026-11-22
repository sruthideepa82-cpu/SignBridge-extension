import { Component } from 'react';

// Keeps a visible, actionable message in the captions window if React rendering fails. It logs only the error type and
// message, never audio or transcript content.
export default class CaptionsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[SignBridge captions] UI failed to initialize', {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="captions">
        <header className="captions-head">
          <div className="captions-brand">
            <span className="captions-logo" aria-hidden="true">SB</span>
            <div>
              <h1>Captions window could not start</h1>
              <p>The extension is running, but its captions interface failed to render.</p>
            </div>
          </div>
        </header>
        <p className="captions-error" role="alert">
          Reload SignBridge in chrome://extensions, then start captions again. No audio or transcript was recorded.
        </p>
        <div className="captions-controls">
          <button type="button" className="button secondary" onClick={() => window.close()}>Close window</button>
        </div>
      </main>
    );
  }
}
