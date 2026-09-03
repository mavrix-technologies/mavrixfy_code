Add-Type -AssemblyName System.Drawing

function Render-BrandingFooter {
    param(
        [int]$Width,
        [int]$Height,
        [float]$SubFontSize,
        [float]$MainFontSize,
        [float]$SubY,
        [float]$MainY,
        [string]$OutputPath
    )

    $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    # Clean typography
    $fontFamily = New-Object System.Drawing.FontFamily("Segoe UI")
    $fontSub = New-Object System.Drawing.Font($fontFamily, $SubFontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $fontMain = New-Object System.Drawing.Font($fontFamily, $MainFontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    # Premium subtle colors
    $colorSub = [System.Drawing.Color]::FromArgb(180, 150, 162, 175) # Muted slate grey
    $colorMain = [System.Drawing.Color]::FromArgb(250, 240, 243, 248) # Crisp pure light text

    $brushSub = New-Object System.Drawing.SolidBrush($colorSub)
    $brushMain = New-Object System.Drawing.SolidBrush($colorMain)

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rectSub = New-Object System.Drawing.RectangleF(0, $SubY, $Width, ($SubFontSize * 1.5))
    $rectMain = New-Object System.Drawing.RectangleF(0, $MainY, $Width, ($MainFontSize * 1.5))

    $g.DrawString("DEVELOPED BY", $fontSub, $brushSub, $rectSub, $sf)
    $g.DrawString("SATVIK PATEL", $fontMain, $brushMain, $rectMain, $sf)

    $dir = [System.IO.Path]::GetDirectoryName($OutputPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $brushSub.Dispose()
    $brushMain.Dispose()
    $fontSub.Dispose()
    $fontMain.Dispose()
    $fontFamily.Dispose()
    $g.Dispose()
    $bmp.Dispose()

    Write-Host "Generated: $OutputPath ($Width x $Height)"
}

# Android 12+ Branding Image specifies maximum 200dp width and 80dp height.
# mdpi (1x)    = 200 x 80
# hdpi (1.5x)  = 300 x 120
# xhdpi (2x)   = 400 x 160
# xxhdpi (3x)  = 600 x 240
# xxxhdpi (4x) = 800 x 320

$baseDir = $PSScriptRoot + "\.."

Render-BrandingFooter -Width 200 -Height 80  -SubFontSize 9  -MainFontSize 15 -SubY 18  -MainY 36  -OutputPath "$baseDir\android\app\src\main\res\drawable-mdpi\branding_footer.png"
Render-BrandingFooter -Width 300 -Height 120 -SubFontSize 13 -MainFontSize 22 -SubY 28  -MainY 54  -OutputPath "$baseDir\android\app\src\main\res\drawable-hdpi\branding_footer.png"
Render-BrandingFooter -Width 400 -Height 160 -SubFontSize 18 -MainFontSize 30 -SubY 37  -MainY 72  -OutputPath "$baseDir\android\app\src\main\res\drawable-xhdpi\branding_footer.png"
Render-BrandingFooter -Width 600 -Height 240 -SubFontSize 27 -MainFontSize 45 -SubY 55  -MainY 108 -OutputPath "$baseDir\android\app\src\main\res\drawable-xxhdpi\branding_footer.png"
Render-BrandingFooter -Width 800 -Height 320 -SubFontSize 36 -MainFontSize 60 -SubY 74  -MainY 144 -OutputPath "$baseDir\android\app\src\main\res\drawable-xxxhdpi\branding_footer.png"

# Also save master assets
Render-BrandingFooter -Width 800 -Height 320 -SubFontSize 36 -MainFontSize 60 -SubY 74  -MainY 144 -OutputPath "$baseDir\assets\images\branding_footer.png"
Render-BrandingFooter -Width 800 -Height 320 -SubFontSize 36 -MainFontSize 60 -SubY 74  -MainY 144 -OutputPath "$baseDir\src\assets\images\branding_footer.png"
