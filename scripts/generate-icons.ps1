Add-Type -AssemblyName System.Drawing

function Create-ExtensionIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = [double]$size / 128.0

    # 1. Background Squircle
    $margin = [Math]::Max(1.0, 3.0 * $scale)
    $rectX = [float]$margin
    $rectY = [float]$margin
    $rectW = [float]($size - (2.0 * $margin))
    $rectH = [float]($size - (2.0 * $margin))
    $radius = [float](28.0 * $scale)

    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = [float]($radius * 2.0)
    $bgPath.AddArc($rectX, $rectY, $diameter, $diameter, 180.0, 90.0)
    $bgPath.AddArc([float]($rectX + $rectW - $diameter), $rectY, $diameter, $diameter, 270.0, 90.0)
    $bgPath.AddArc([float]($rectX + $rectW - $diameter), [float]($rectY + $rectH - $diameter), $diameter, $diameter, 0.0, 90.0)
    $bgPath.AddArc($rectX, [float]($rectY + $rectH - $diameter), $diameter, $diameter, 90.0, 90.0)
    $bgPath.CloseFigure()

    # Gradient: Navy/Indigo (#0f172a -> #1e1b4b)
    $gradientRect = New-Object System.Drawing.RectangleF $rectX, $rectY, $rectW, $rectH
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $gradientRect,
        [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
        [System.Drawing.Color]::FromArgb(255, 30, 27, 75),
        45.0
    )
    $g.FillPath($bgBrush, $bgPath)

    # Glowing subtle border (#38bdf8)
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 56, 189, 248), [float][Math]::Max(1.0, 2.5 * $scale))
    $g.DrawPath($borderPen, $bgPath)

    # 2. Element Inspector Reticle (Target Brackets in Cyan #38bdf8)
    $reticlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), [float][Math]::Max(1.5, 4.5 * $scale))
    $reticlePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $reticlePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $bracketMargin = [float](26.0 * $scale)
    $bracketLen = [float](14.0 * $scale)
    $left = $bracketMargin
    $right = [float]($size - $bracketMargin)
    $top = $bracketMargin
    $bottom = [float]($size - $bracketMargin)

    # Top-Left corner
    $g.DrawLine($reticlePen, $left, [float]($top + $bracketLen), $left, $top)
    $g.DrawLine($reticlePen, $left, $top, [float]($left + $bracketLen), $top)

    # Top-Right corner
    $g.DrawLine($reticlePen, [float]($right - $bracketLen), $top, $right, $top)
    $g.DrawLine($reticlePen, $right, $top, $right, [float]($top + $bracketLen))

    # Bottom-Left corner
    $g.DrawLine($reticlePen, $left, [float]($bottom - $bracketLen), $left, $bottom)
    $g.DrawLine($reticlePen, $left, $bottom, [float]($left + $bracketLen), $bottom)

    # Bottom-Right corner
    $g.DrawLine($reticlePen, [float]($right - $bracketLen), $bottom, $right, $bottom)
    $g.DrawLine($reticlePen, $right, $bottom, $right, [float]($bottom - $bracketLen))

    # 3. Action Cursor Pointer
    if ($size -ge 32) {
        $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 0, 0, 0))
        $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $sOff = 2.0 * $scale
        $shadowPts = [System.Drawing.PointF[]]@(
            (New-Object System.Drawing.PointF ([float](40.0 * $scale + $sOff), [float](36.0 * $scale + $sOff))),
            (New-Object System.Drawing.PointF ([float](40.0 * $scale + $sOff), [float](82.0 * $scale + $sOff))),
            (New-Object System.Drawing.PointF ([float](52.0 * $scale + $sOff), [float](70.0 * $scale + $sOff))),
            (New-Object System.Drawing.PointF ([float](66.0 * $scale + $sOff), [float](94.0 * $scale + $sOff))),
            (New-Object System.Drawing.PointF ([float](74.0 * $scale + $sOff), [float](89.0 * $scale + $sOff))),
            (New-Object System.Drawing.PointF ([float](60.0 * $scale + $sOff), [float](66.0 * $scale + $sOff))),
            (New-Object System.Drawing.PointF ([float](78.0 * $scale + $sOff), [float](66.0 * $scale + $sOff)))
        )
        $shadowPath.AddPolygon($shadowPts)
        $g.FillPath($shadowBrush, $shadowPath)
        $shadowBrush.Dispose()
        $shadowPath.Dispose()
    }

    # Cursor Polygon
    $cursorBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
    $cursorPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cursorPts = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF ([float](40.0 * $scale), [float](36.0 * $scale))),
        (New-Object System.Drawing.PointF ([float](40.0 * $scale), [float](82.0 * $scale))),
        (New-Object System.Drawing.PointF ([float](52.0 * $scale), [float](70.0 * $scale))),
        (New-Object System.Drawing.PointF ([float](66.0 * $scale), [float](94.0 * $scale))),
        (New-Object System.Drawing.PointF ([float](74.0 * $scale), [float](89.0 * $scale))),
        (New-Object System.Drawing.PointF ([float](60.0 * $scale), [float](66.0 * $scale))),
        (New-Object System.Drawing.PointF ([float](78.0 * $scale), [float](66.0 * $scale)))
    )
    $cursorPath.AddPolygon($cursorPts)
    $g.FillPath($cursorBrush, $cursorPath)

    $cursorPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 15, 23, 42), [float][Math]::Max(1.0, 1.8 * $scale))
    $g.DrawPath($cursorPen, $cursorPath)

    # 4. Recording Pulse Badge (Red Dot #ef4444 with soft glow at top-right)
    $redDotRadius = [float](11.0 * $scale)
    $redDotCenterX = [float]($size - (32.0 * $scale))
    $redDotCenterY = [float](34.0 * $scale)

    # Outer glow
    $glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 239, 68, 68), [float][Math]::Max(1.0, 3.0 * $scale))
    $g.DrawEllipse($glowPen, [float]($redDotCenterX - $redDotRadius - (2.0 * $scale)), [float]($redDotCenterY - $redDotRadius - (2.0 * $scale)), [float](($redDotRadius * 2.0) + (4.0 * $scale)), [float](($redDotRadius * 2.0) + (4.0 * $scale)))

    # Solid red center
    $redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
    $g.FillEllipse($redBrush, [float]($redDotCenterX - $redDotRadius), [float]($redDotCenterY - $redDotRadius), [float]($redDotRadius * 2.0), [float]($redDotRadius * 2.0))

    # Inner bright highlight on red dot
    if ($size -ge 32) {
        $highlightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 254, 202, 202))
        $g.FillEllipse($highlightBrush, [float]($redDotCenterX - ($redDotRadius * 0.45)), [float]($redDotCenterY - ($redDotRadius * 0.55)), [float]($redDotRadius * 0.7), [float]($redDotRadius * 0.6))
        $highlightBrush.Dispose()
    }

    # Cleanup resources
    $bgBrush.Dispose()
    $borderPen.Dispose()
    $reticlePen.Dispose()
    $cursorBrush.Dispose()
    $cursorPen.Dispose()
    $cursorPath.Dispose()
    $glowPen.Dispose()
    $redBrush.Dispose()
    $bgPath.Dispose()
    $g.Dispose()

    return $bmp
}

$targetDirs = @(
    "D:\Develop\chrome_plugin\Web_Action_Tracker\public\icons",
    "D:\Develop\chrome_plugin\Web_Action_Tracker\dist\icons"
)

foreach ($dir in $targetDirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    @(16, 48, 128) | ForEach-Object {
        $size = [int]$_
        $bmp = Create-ExtensionIcon -size $size
        $filePath = Join-Path $dir "icon$size.png"
        $bmp.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Created: $filePath ($size x $size)"
    }
}
