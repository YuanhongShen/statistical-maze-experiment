<?php
header('Content-Type: application/json');

$json = file_get_contents('php://input');
$obj = json_decode($json, true);

if (!is_array($obj) || !isset($obj['filename']) || !isset($obj['filedata'])) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'error' => 'Missing filename or filedata.'));
    exit;
}

$data_dir = __DIR__ . DIRECTORY_SEPARATOR . 'data';

if (!is_dir($data_dir) && !mkdir($data_dir, 0755, true)) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'error' => 'Could not create data directory.'));
    exit;
}

$filename = basename($obj['filename']);
$filename = preg_replace('/[^A-Za-z0-9_.-]/', '_', $filename);
$path = $data_dir . DIRECTORY_SEPARATOR . $filename;

$real_data_dir = realpath($data_dir);
$real_parent = realpath(dirname($path));

if ($real_data_dir === false || $real_parent === false || strpos($real_parent, $real_data_dir) !== 0) {
    http_response_code(400);
    echo json_encode(array('ok' => false, 'error' => 'Invalid save path.'));
    exit;
}

$ok = file_put_contents($path, $obj['filedata'],  LOCK_EX);

if ($ok === false) {
    http_response_code(500);
    echo json_encode(array('ok' => false, 'error' => 'Could not write data file.'));
    exit;
}

echo json_encode(array('ok' => true, 'filename' => $filename));
?>
