// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../../src/components/Layout";

// Mock socket.io-client
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Mock the auth store
let mockAuthState = {
  token: null as string | null,
  role: null as string | null,
  setAuth: vi.fn(),
  logout: vi.fn(),
};

vi.mock("../../src/lib/store", () => ({
  useAuthStore: () => mockAuthState,
}));

function renderLayout(path = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout />
    </MemoryRouter>
  );
}

describe("Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when no token", () => {
    mockAuthState = { ...mockAuthState, token: null, role: null };
    renderLayout();
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
  });

  it("shows admin nav items when role is admin", () => {
    mockAuthState = { ...mockAuthState, token: "test-token", role: "admin" };
    renderLayout();
    // Nav items appear in both sidebar and mobile bottom bar
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Students").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Payments").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Calendar").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Messages").length).toBeGreaterThanOrEqual(1);
  });

  it("hides admin-only nav items for client role", () => {
    mockAuthState = { ...mockAuthState, token: "test-token", role: "client" };
    renderLayout();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Students")).not.toBeInTheDocument();
    expect(screen.queryByText("Payments")).not.toBeInTheDocument();
    // Client still sees Calendar, Messages, Profile
    expect(screen.getAllByText("Calendar").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Messages").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Profile").length).toBeGreaterThanOrEqual(1);
  });

  it("renders sign out button", () => {
    mockAuthState = { ...mockAuthState, token: "test-token", role: "admin" };
    renderLayout();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("shows school name in sidebar", () => {
    mockAuthState = { ...mockAuthState, token: "test-token", role: "admin" };
    renderLayout();
    expect(screen.getByText("Olaines autoskola")).toBeInTheDocument();
  });
});
