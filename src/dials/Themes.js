export const Themes = {
    cyan: {
        id: 'cyan',
        primary: [0.0, 0.898, 1.0, 0.95],
        primaryGlow: [0.0, 0.898, 1.0, 0.15],
        secondary: [0.0, 0.65, 0.95, 0.75],
        coral: [1.0, 0.36, 0.44, 0.95],
        coralGlow: [1.0, 0.36, 0.44, 0.18],
        track: [1.0, 1.0, 1.0, 0.10],
        accentCss: '#00e5ff',
        textWhite: '#ffffff',
        textDim: 'rgba(255, 255, 255, 0.65)',
        rgb: (alpha = 1.0) => [0.0, 0.898, 1.0, alpha],
    },
    white: {
        id: 'white',
        primary: [1.0, 1.0, 1.0, 0.95],
        primaryGlow: [1.0, 1.0, 1.0, 0.15],
        secondary: [1.0, 1.0, 1.0, 0.6],
        coral: [1.0, 0.45, 0.45, 0.95],
        coralGlow: [1.0, 0.45, 0.45, 0.18],
        track: [1.0, 1.0, 1.0, 0.12],
        accentCss: '#ffffff',
        textWhite: '#ffffff',
        textDim: 'rgba(255, 255, 255, 0.65)',
        rgb: (alpha = 1.0) => [1.0, 1.0, 1.0, alpha],
    },
    amber: {
        id: 'amber',
        primary: [1.0, 0.588, 0.0, 0.95],
        primaryGlow: [1.0, 0.588, 0.0, 0.15],
        secondary: [1.0, 0.42, 0.0, 0.75],
        coral: [1.0, 0.28, 0.28, 0.95],
        coralGlow: [1.0, 0.28, 0.28, 0.18],
        track: [1.0, 1.0, 1.0, 0.10],
        accentCss: '#ff9100',
        textWhite: '#ffffff',
        textDim: 'rgba(255, 255, 255, 0.65)',
        rgb: (alpha = 1.0) => [1.0, 0.588, 0.0, alpha],
    },
    green: {
        id: 'green',
        primary: [0.0, 0.902, 0.463, 0.95],
        primaryGlow: [0.0, 0.902, 0.463, 0.15],
        secondary: [0.0, 0.75, 0.38, 0.75],
        coral: [1.0, 0.40, 0.35, 0.95],
        coralGlow: [1.0, 0.40, 0.35, 0.18],
        track: [1.0, 1.0, 1.0, 0.10],
        accentCss: '#00e676',
        textWhite: '#ffffff',
        textDim: 'rgba(255, 255, 255, 0.65)',
        rgb: (alpha = 1.0) => [0.0, 0.902, 0.463, alpha],
    },
};

export function getTheme(name) {
    return Themes[name] || Themes.cyan;
}

export function interpolateColor(c1, c2, factor) {
    const f = Math.min(1.0, Math.max(0.0, factor));
    return [
        c1[0] + ((c2[0] - c1[0]) * f),
        c1[1] + ((c2[1] - c1[1]) * f),
        c1[2] + ((c2[2] - c1[2]) * f),
        c1[3] !== undefined && c2[3] !== undefined ? c1[3] + ((c2[3] - c1[3]) * f) : 0.95,
    ];
}

export function drawArc(cr, cx, cy, radius, width, progress, trackColor, indicatorColor, startAngle = -Math.PI / 2, totalAngle = 2 * Math.PI) {
    const endAngle = startAngle + totalAngle;
    const clampedProg = Math.min(1.0, Math.max(0.0, progress || 0));
    const progAngle = startAngle + (totalAngle * clampedProg);

    cr.newSubPath();
    cr.setLineWidth(width);
    cr.setLineCap(1);
    cr.setSourceRGBA(...trackColor);
    cr.arc(cx, cy, radius, startAngle, endAngle);
    cr.stroke();

    if (clampedProg > 0.005) {
        cr.newSubPath();
        cr.setLineWidth(width + 4);
        cr.setSourceRGBA(indicatorColor[0], indicatorColor[1], indicatorColor[2], 0.15);
        cr.arc(cx, cy, radius, startAngle, progAngle);
        cr.stroke();

        cr.newSubPath();
        cr.setLineWidth(width);
        cr.setSourceRGBA(...indicatorColor);
        cr.arc(cx, cy, radius, startAngle, progAngle);
        cr.stroke();
    }
}

