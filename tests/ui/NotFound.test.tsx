// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotFound } from "../../src/pages/NotFound";

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <NotFound />
    </MemoryRouter>
  );
}

describe("NotFound page", () => {
  it("renders 404 heading", () => {
    renderWithRouter();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows 'Page not found' message", () => {
    renderWithRouter();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("has a link back to home", () => {
    renderWithRouter();
    const link = screen.getByText("Back to Home");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/");
  });
});
