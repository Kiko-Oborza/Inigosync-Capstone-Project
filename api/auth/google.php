<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$credential = $input['credential'] ?? null;

if (!$credential) {
    http_response_code(400);
    echo json_encode(['message' => 'Google credential is required']);
    exit;
}

$expectedClientId = getenv('GOOGLE_CLIENT_ID') ?: '468046102878-186spg6ujhcf14hiqomq8fimc0in6ec9.apps.googleusercontent.com';
$tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);

$context = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 10,
        'ignore_errors' => true
    ]
]);

$response = @file_get_contents($tokenInfoUrl, false, $context);
if ($response === false) {
    http_response_code(502);
    echo json_encode(['message' => 'Unable to contact Google verification endpoint']);
    exit;
}

$payload = json_decode($response, true);
if (!is_array($payload) || empty($payload['email']) || ($payload['aud'] ?? '') !== $expectedClientId) {
    http_response_code(401);
    echo json_encode(['message' => 'Google token could not be verified']);
    exit;
}

$user = [
    'provider' => 'google',
    'name' => $payload['name'] ?? $payload['email'],
    'email' => $payload['email'],
    'picture' => $payload['picture'] ?? ''
];

$token = bin2hex(random_bytes(24));

echo json_encode([
    'message' => 'Google sign-in successful',
    'token' => $token,
    'user' => $user,
    'redirectTo' => '/Pages/user_dashboard.html'
]);
