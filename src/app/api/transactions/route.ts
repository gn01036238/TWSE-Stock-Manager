import { NextRequest, NextResponse } from 'next/server';
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
  updateTransaction,
  getBrokers,
} from '@/lib/supabase';
import { syncStockDividendTransactions } from '@/lib/stock-dividend-sync';
import type { Transaction } from '@/types';

export async function GET() {
  try {
    let transactions = await getTransactions();

    // 除權配股要變成一筆真的交易紀錄，持股數才會對。已經補過的不會再寫，
    // 所以這裡每次都跑；穩定狀態下不會多打任何一次資料庫。
    let stockDividendError: string | null = null;
    try {
      const added = await syncStockDividendTransactions(transactions);
      if (added.length > 0) transactions = await getTransactions();
    } catch (error) {
      // 補不進去（最常見是資料表的 transaction_type 檢查條件還沒加上 STOCK_DIVIDEND）
      // 不該讓整個交易紀錄跟著壞掉，交易照樣回、把原因帶給前端顯示就好
      console.error('Stock dividend sync error:', error);
      // supabase-js 丟的是普通物件不是 Error，直接取 message 才看得到真正的原因
      const message = (error as { message?: string } | null)?.message;
      stockDividendError = message || '配股紀錄補寫失敗';
    }

    const brokers = await getBrokers();

    return NextResponse.json({
      transactions,
      brokers,
      stockDividendError,
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
