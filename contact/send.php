<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

function unavailable(): void
{
    respond(503, ['message' => 'Messages are temporarily unavailable. Please try again later.']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['message' => 'Use the contact form to send a message.']);
}

$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if ($contentType !== 'application/json') {
    respond(415, ['message' => 'Use the contact form to send a message.']);
}

$body = file_get_contents('php://input', false, null, 0, 8193);
if ($body === false || strlen($body) > 8192) {
    respond(413, ['message' => 'The message is too long. Please shorten it.']);
}
$input = json_decode($body, true);
if (!is_array($input)) {
    respond(400, ['message' => 'Please complete the contact form and try again.']);
}

$name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
$email = is_string($input['email'] ?? null) ? trim($input['email']) : '';
$message = is_string($input['message'] ?? null) ? trim($input['message']) : '';
if ($name === '' || strlen($name) > 400 || preg_match('/[\x00-\x1F\x7F]/', $name)) {
    respond(422, ['message' => 'Please enter your name.']);
}
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['message' => 'Please enter a valid email address.']);
}
if ($message === '' || strlen($message) > 4000 || strpos($message, "\0") !== false) {
    respond(422, ['message' => 'Please enter a shorter message.']);
}

$configPath = realpath(getenv('CONTACT_FORM_CONFIG')
    ?: dirname(__DIR__, 2) . '/contact-private/contact-config.php');
$webRoot = realpath(dirname(__DIR__));
if ($configPath === false || $webRoot === false || strpos($configPath, $webRoot . DIRECTORY_SEPARATOR) === 0
    || !is_file($configPath) || !is_readable($configPath)) {
    unavailable();
}

$config = require $configPath;
if (!is_array($config)) {
    unavailable();
}

$privateDir = dirname($configPath);
$preview = ($config['mode'] ?? null) === 'preview';
$recipient = $config['recipient'] ?? '';
$sender = $config['sender'] ?? '';
if (!$preview && (($config['mode'] ?? null) !== 'email'
    || !is_string($recipient) || !filter_var($recipient, FILTER_VALIDATE_EMAIL)
    || !is_string($sender) || !filter_var($sender, FILTER_VALIDATE_EMAIL))) {
    unavailable();
}

$request = [
    'received_at' => gmdate('c'),
    'name' => $name,
    'email' => $email,
    'message' => $message,
];

if ($preview) {
    $saved = file_put_contents($privateDir . '/contact-inbox.jsonl', json_encode($request) . "\n", FILE_APPEND | LOCK_EX);
    if ($saved === false) {
        unavailable();
    }
    respond(200, ['ok' => true, 'preview' => true]);
}

// Limit contact messages to five per server-observed IP and 25 total per day.
$state = fopen($privateDir . '/contact-rate.json', 'c+');
if ($state === false || !flock($state, LOCK_EX)) {
    unavailable();
}
$now = time();
$address = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
$history = json_decode((string) stream_get_contents($state), true) ?? [];
$recent = array_values(array_filter($history, static function ($attempt) use ($now) {
    return $attempt['time'] > $now - 86400;
}));
$fromAddress = array_filter($recent, static function ($attempt) use ($address) {
    return $attempt['address'] === $address;
});
if (count($fromAddress) >= 5 || count($recent) >= 25) {
    flock($state, LOCK_UN);
    fclose($state);
    header('Retry-After: 86400');
    respond(429, ['message' => 'Too many messages. Please try again tomorrow.']);
}
$recent[] = ['address' => $address, 'time' => $now];
$encoded = json_encode($recent);
$stored = rewind($state) && ftruncate($state, 0) && fwrite($state, $encoded) === strlen($encoded) && fflush($state);
flock($state, LOCK_UN);
fclose($state);
if (!$stored) {
    unavailable();
}

$emailBody = "From: {$request['name']} <{$request['email']}>\n\n" . $request['message'];
$fromHeader = $sender . ' <' . $sender . '>';
if (!mail($recipient, 'Website contact note', $emailBody, [
    'From' => $fromHeader,
    'Reply-To' => $email,
    'Content-Type' => 'text/plain; charset=UTF-8',
])) {
    unavailable();
}

respond(200, ['ok' => true]);
