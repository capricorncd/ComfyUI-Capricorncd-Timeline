Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$picker = New-Object System.Windows.Forms.OpenFileDialog
$picker.Title = 'project.json'
$picker.Filter = 'project.json|project.json'
$picker.CheckFileExists = $true
try {
    if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::Write($picker.FileName)
    }
} finally {
    $picker.Dispose()
}
