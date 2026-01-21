import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/agent/graph';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const response = await runAgent(message);

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
