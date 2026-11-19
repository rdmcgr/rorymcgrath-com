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
    respond(503, ['message' => 'Borrowing requests are temporarily unavailable. Please try again later.']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['message' => 'Use the bookshelf form to send a request.']);
}

$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
if ($contentType !== 'application/json') {
    respond(415, ['message' => 'Use the bookshelf form to send a request.']);
}

$body = file_get_contents('php://input', false, null, 0, 8193);
if ($body === false || strlen($body) > 8192) {
    respond(413, ['message' => 'The request is too long. Please shorten your note.']);
}
$input = json_decode($body, true);
if (!is_array($input) || !is_array($input['book'] ?? null)) {
    respond(400, ['message' => 'Open a book from the library to send a request.']);
}

$name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
$email = is_string($input['email'] ?? null) ? trim($input['email']) : '';
$note = $input['note'] ?? '';
if ($name === '' || strlen($name) > 400 || preg_match('/[\x00-\x1F\x7F]/', $name)) {
    respond(422, ['message' => 'Please enter your name.']);
}
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['message' => 'Please enter a valid email address.']);
}
if (!is_string($note) || strlen($note) > 4000 || strpos($note, "\0") !== false) {
    respond(422, ['message' => 'Please enter a shorter note.']);
}
if (preg_match('/\S/u', $note) !== 1) {
    respond(422, ['message' => 'Please enter a note.']);
}

$catalog = json_decode((string) file_get_contents(__DIR__ . '/catalog.json'), true);
if (!is_array($catalog['books'] ?? null)) {
    unavailable();
}
$book = null;
foreach ($catalog['books'] as $entry) {
    if ($entry['title'] === ($input['book']['title'] ?? null)
        && $entry['author'] === ($input['book']['author'] ?? null)) {
        $book = $entry;
        break;
    }
}
if ($book === null) {
    respond(404, ['message' => 'This book couldn’t be found. Refresh the library and try again.']);
}

$configPath = realpath(getenv('BOOKSHELF_BORROW_CONFIG')
    ?: dirname(__DIR__, 2) . '/bookshelf-private/borrow-config.php');
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
    'title' => $book['title'],
    'author' => $book['author'],
    'name' => $name,
    'email' => $email,
    'note' => trim($note),
];

if ($preview) {
    $saved = file_put_contents($privateDir . '/borrow-inbox.jsonl', json_encode($request) . "\n", FILE_APPEND | LOCK_EX);
    if ($saved === false) {
        unavailable();
    }
    respond(200, ['ok' => true, 'preview' => true]);
}

// Count delivery attempts in a rolling window. Use the server's address, never a client-supplied forwarding header.
$state = fopen($privateDir . '/borrow-rate.json', 'c+');
if ($state === false || !flock($state, LOCK_EX)) {
    unavailable();
}
$now = time();
$address = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
$history = json_decode((string) stream_get_contents($state), true) ?? [];
$recent = array_values(array_filter($history, static function ($attempt) use ($now) {
    return $attempt['time'] > $now - 900;
}));
$fromAddress = array_filter($recent, static function ($attempt) use ($address) {
    return $attempt['address'] === $address;
});
if (count($fromAddress) >= 5 || count($recent) >= 60) {
    flock($state, LOCK_UN);
    fclose($state);
    header('Retry-After: 900');
    respond(429, ['message' => 'Too many requests. Please try again in 15 minutes.']);
}
$recent[] = ['address' => $address, 'time' => $now];
$encoded = json_encode($recent);
$stored = rewind($state) && ftruncate($state, 0) && fwrite($state, $encoded) === strlen($encoded) && fflush($state);
flock($state, LOCK_UN);
fclose($state);
if (!$stored) {
    unavailable();
}

$message = "Book: {$request['title']}\n"
    . "Author: {$request['author']}\n\n"
    . "From: {$request['name']} <{$request['email']}>\n\n"
    . $request['note'];
if (!mail($recipient, 'Bookshelf borrowing request', $message, [
    'From' => $sender,
    'Reply-To' => $email,
    'Content-Type' => 'text/plain; charset=UTF-8',
])) {
    unavailable();
}
respond(200, ['ok' => true]);
