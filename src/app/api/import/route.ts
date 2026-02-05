import { NextRequest, NextResponse } from 'next/server';
import { parseCsvToTransactions, countTransactionsByType } from '@/lib/csv-parser';
import { createTransactions, getBrokers } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const brokerId = formData.get('brokerId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!brokerId) {
      return NextResponse.json({ error: 'No broker selected' }, { status: 400 });
    }

    const csvContent = await file.text();
    const transactions = parseCsvToTransactions(csvContent, brokerId);
    const counts = countTransactionsByType(csvContent);

    // Insert transactions to Supabase
    const inserted = await createTransactions(transactions);

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${inserted.length} transactions`,
      counts: {
        imported: inserted.length,
        buys: counts.buys,
        sells: counts.sells,
        dividends: counts.dividends,
        skippedDividends: counts.dividends, // Dividends are auto-calculated
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

// Preview endpoint - doesn't save to database
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvContent = await file.text();
    const brokers = await getBrokers();
    const defaultBrokerId = brokers[0]?.id || '';

    const transactions = parseCsvToTransactions(csvContent, defaultBrokerId);
    const counts = countTransactionsByType(csvContent);

    // Return preview data (first 10 transactions)
    return NextResponse.json({
      preview: transactions.slice(0, 10),
      counts: {
        total: transactions.length,
        buys: counts.buys,
        sells: counts.sells,
        dividends: counts.dividends,
      },
      brokers,
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview failed' },
      { status: 500 }
    );
  }
}
