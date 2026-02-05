import { NextRequest, NextResponse } from 'next/server';
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
  updateTransaction,
  getBrokers,
} from '@/lib/supabase';
import type { Transaction } from '@/types';

export async function GET() {
  try {
    const transactions = await getTransactions();
    const brokers = await getBrokers();

    return NextResponse.json({
      transactions,
      brokers,
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get transactions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const transaction: Omit<Transaction, 'id' | 'created_at'> = {
      broker_id: body.broker_id,
      ticker: body.ticker.toUpperCase(),
      transaction_date: body.transaction_date,
      transaction_type: body.transaction_type,
      quantity: parseFloat(body.quantity),
      price: parseFloat(body.price),
      commission: parseFloat(body.commission) || 0,
      tax: parseFloat(body.tax) || 0,
      decision_reason: body.decision_reason || null,
    };

    const created = await createTransaction(transaction);

    return NextResponse.json({ success: true, transaction: created });
  } catch (error) {
    console.error('Create transaction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'No transaction ID provided' }, { status: 400 });
    }

    await deleteTransaction(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'No transaction ID provided' }, { status: 400 });
    }

    const updated = await updateTransaction(id, updates);

    return NextResponse.json({ success: true, transaction: updated });
  } catch (error) {
    console.error('Update transaction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
      { status: 500 }
    );
  }
}
