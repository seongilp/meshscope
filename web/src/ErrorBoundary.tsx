import { Component, type ReactNode } from "react";

interface Props {
  /** Used to reset the boundary when the active view changes. */
  resetKey?: string;
  label?: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    // Clear the error when the caller switches to a different view.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-sm text-red-400">
          <p className="font-semibold">
            {this.props.label ?? "This view"} failed to render.
          </p>
          <p className="text-zinc-500 mt-1">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
