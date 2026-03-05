export type LayoutPreset = "desktop" | "tablet" | "mobile";

export type SidebarOpenState = {
  info: boolean;
  controls: boolean;
  status: boolean;
};

type VertexSizeInput = {
  containerWidth: number;
  containerHeight: number;
  boardSize: number;
  showCoordinates: boolean;
};

const MIN_DESKTOP_WIDTH = 1200;
const MIN_TABLET_WIDTH = 768;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const resolveLayoutPreset = (width: number, _height: number): LayoutPreset => {
  if (!Number.isFinite(width) || width <= 0) {
    return "mobile";
  }

  if (width >= MIN_DESKTOP_WIDTH) {
    return "desktop";
  }

  if (width >= MIN_TABLET_WIDTH) {
    return "tablet";
  }

  return "mobile";
};

export const isCompactLayout = (preset: LayoutPreset): boolean => preset !== "desktop";

export const initialSidebarOpen = (preset: LayoutPreset): SidebarOpenState => {
  if (preset === "desktop") {
    return { info: true, controls: true, status: false };
  }

  if (preset === "tablet") {
    return { info: false, controls: true, status: false };
  }

  return { info: false, controls: true, status: false };
};

export const computeVertexSize = ({
  containerWidth,
  containerHeight,
  boardSize,
  showCoordinates
}: VertexSizeInput): number => {
  const normalizedBoardSize = Number.isFinite(boardSize) && boardSize > 0 ? boardSize : 19;
  const width = Number.isFinite(containerWidth) ? containerWidth : 0;
  const height = Number.isFinite(containerHeight) ? containerHeight : 0;
  const available = Math.max(0, Math.min(width, height));
  const paddingFactor = showCoordinates ? 3.0 : 1.8;
  const raw = Math.floor(available / (normalizedBoardSize + paddingFactor));
  return clamp(raw, 14, 34);
};
