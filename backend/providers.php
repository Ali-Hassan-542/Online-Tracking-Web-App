<?php
declare(strict_types=1);

interface CommunicationProvider
{
    public function sendSms(string $toPhone, string $message): array;
    public function placeCall(string $toPhone, ?string $messageUrl = null): array;
}

final class MockProvider implements CommunicationProvider
{
    public function sendSms(string $toPhone, string $message): array
    {
        return [
            'ok' => true,
            'status' => 'queued',
            'provider_message_id' => 'msg_' . bin2hex(random_bytes(6)),
            'meta' => [
                'to' => $toPhone,
                'length' => mb_strlen($message),
            ],
        ];
    }

    public function placeCall(string $toPhone, ?string $messageUrl = null): array
    {
        return [
            'ok' => true,
            'status' => 'queued',
            'provider_call_id' => 'call_' . bin2hex(random_bytes(6)),
            'meta' => [
                'to' => $toPhone,
                'message_url' => $messageUrl,
            ],
        ];
    }
}

function communicationProvider(array $config): CommunicationProvider
{
    $providerName = strtolower((string) ($config['provider']['name'] ?? 'mock'));
    if ($providerName === 'mock') {
        return new MockProvider();
    }

    // Placeholder for Twilio/Vonage implementations.
    return new MockProvider();
}
