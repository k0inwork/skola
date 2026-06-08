// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  const defaults = {
    title: "Delete item?",
    message: "This action cannot be undone.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders when open", () => {
    render(<ConfirmDialog open={true} {...defaults} />);
    expect(screen.getByText("Delete item?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("hides when closed", () => {
    render(<ConfirmDialog open={false} {...defaults} />);
    expect(screen.queryByText("Delete item?")).not.toBeInTheDocument();
  });

  it("shows custom confirm/cancel labels", () => {
    render(
      <ConfirmDialog
        open={true}
        {...defaults}
        confirmLabel="Yes, delete"
        cancelLabel="Go back"
      />
    );
    expect(screen.getByText("Yes, delete")).toBeInTheDocument();
    expect(screen.getByText("Go back")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open={true} {...defaults} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel then onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open={true} {...defaults} onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText("Confirm"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when backdrop is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open={true} {...defaults} onCancel={onCancel} />);
    // Backdrop is the outer fixed div
    const backdrop = screen.getByText("Delete item?").closest(".fixed")!.parentElement!;
    fireEvent.click(backdrop.firstElementChild!);
    expect(onCancel).toHaveBeenCalled();
  });
});
