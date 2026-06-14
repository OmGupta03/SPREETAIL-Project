import { supabase } from './supabase';

// ==========================================
// 1. GROUP OPERATIONS
// ==========================================

// Create a group and add the creator as the first member
export async function createGroup(name, creatorId) {
  if (!name || !creatorId) throw new Error('Group name and creator ID are required');

  // Insert group
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert([{ name, created_by: creatorId }])
    .select()
    .single();

  if (groupError) throw groupError;

  // Add creator as member
  const { error: memberError } = await supabase
    .from('group_members')
    .insert([{ group_id: group.id, user_id: creatorId }]);

  if (memberError) throw memberError;

  return group;
}

// Fetch all groups for a user
export async function fetchUserGroups(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('group_members')
    .select(`
      group_id,
      groups (
        id,
        name,
        created_at
      )
    `)
    .eq('user_id', userId);

  if (error) throw error;
  return data.map((item) => item.groups).filter(Boolean);
}

// Fetch details for a specific group
export async function fetchGroupDetails(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (error) throw error;
  return data;
}

// Fetch all members of a group
export async function fetchGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      user_id,
      users (
        id,
        email,
        name
      )
    `)
    .eq('group_id', groupId);

  if (error) throw error;
  return data.map((item) => item.users).filter(Boolean);
}

// Invite user to group by email
export async function inviteUserToGroup(groupId, email) {
  if (!groupId || !email) throw new Error('Group ID and email are required');

  // Find user by email
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (userError) throw userError;
  if (!user) {
    throw new Error(`User with email "${email}" is not registered. They must sign up first.`);
  }

  // Check if already a member
  const { data: member, error: memberError } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) throw memberError;
  if (member) {
    throw new Error('User is already a member of this group.');
  }

  // Add user to group
  const { error: insertError } = await supabase
    .from('group_members')
    .insert([{ group_id: groupId, user_id: user.id }]);

  if (insertError) throw insertError;
  return user;
}

// Remove user from group (only if balance is 0)
export async function removeUserFromGroup(groupId, userId) {
  if (!groupId || !userId) throw new Error('Group ID and User ID are required');

  // Fetch balances to ensure it is 0
  const balances = await calculateBalancesAndDebts(groupId);
  const userBalance = balances.netBalances[userId] || 0;

  if (Math.abs(userBalance) > 0.01) {
    throw new Error('Cannot remove user. User has outstanding debts or is owed money in this group.');
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

// Delete a group (only if fully settled up)
export async function deleteGroup(groupId) {
  if (!groupId) throw new Error('Group ID is required');

  // Fetch balances to ensure everyone is fully settled
  const balances = await calculateBalancesAndDebts(groupId);
  const hasUnsettled = Object.values(balances.netBalances).some((bal) => Math.abs(bal) > 0.01);

  if (hasUnsettled) {
    throw new Error('Cannot delete group. All members must be fully settled up (outstanding balances must be $0.00).');
  }

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (error) throw error;
  return true;
}

// ==========================================
// 2. EXPENSE OPERATIONS
// ==========================================

// Add an expense and its splits
export async function addExpense(groupId, paidBy, description, amount, splitType, splits) {
  // splits: Array of { userId, amount, percentage, share }
  if (!groupId || !paidBy || !description || !amount || !splitType || !splits || splits.length === 0) {
    throw new Error('All expense fields and splits are required');
  }

  // Double-check total split amounts sum to total amount
  const splitsSum = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
  if (Math.abs(splitsSum - parseFloat(amount)) > 0.02) {
    throw new Error(`The sum of splits (${splitsSum.toFixed(2)}) must equal the total amount (${parseFloat(amount).toFixed(2)})`);
  }

  // 1. Insert expense
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert([
      {
        group_id: groupId,
        paid_by: paidBy,
        description,
        amount: parseFloat(amount),
        split_type: splitType,
      },
    ])
    .select()
    .single();

  if (expenseError) throw expenseError;

  // 2. Insert splits
  const splitInserts = splits.map((s) => ({
    expense_id: expense.id,
    user_id: s.userId,
    amount: parseFloat(s.amount),
    percentage: s.percentage ? parseFloat(s.percentage) : null,
    share: s.share ? parseFloat(s.share) : null,
  }));

  const { error: splitsError } = await supabase
    .from('expense_splits')
    .insert(splitInserts);

  if (splitsError) {
    // Attempt rollback of the expense row manually (since we are on client)
    await supabase.from('expenses').delete().eq('id', expense.id);
    throw splitsError;
  }

  return expense;
}

// Fetch all expenses for a group
export async function fetchGroupExpenses(groupId) {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      *,
      payer:users!expenses_paid_by_fkey (
        id,
        name,
        email
      )
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Fetch details of a single expense and its splits
export async function fetchExpenseDetails(expenseId) {
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select(`
      *,
      payer:users!expenses_paid_by_fkey (
        id,
        name,
        email
      )
    `)
    .eq('id', expenseId)
    .single();

  if (expenseError) throw expenseError;

  const { data: splits, error: splitsError } = await supabase
    .from('expense_splits')
    .select(`
      *,
      user:users(id, name, email)
    `)
    .eq('expense_id', expenseId);

  if (splitsError) throw splitsError;

  return { ...expense, splits };
}

// Delete an expense
export async function deleteExpense(expenseId) {
  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId);

  if (error) throw error;
  return true;
}

// ==========================================
// 3. SETTLEMENT OPERATIONS
// ==========================================

export async function recordSettlement(groupId, payerId, payeeId, amount) {
  if (!groupId || !payerId || !payeeId || !amount) {
    throw new Error('All settlement parameters are required');
  }

  const { data, error } = await supabase
    .from('settlements')
    .insert([
      {
        group_id: groupId,
        payer_id: payerId,
        payee_id: payeeId,
        amount: parseFloat(amount),
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchGroupSettlements(groupId) {
  const { data, error } = await supabase
    .from('settlements')
    .select(`
      *,
      payer:users!settlements_payer_id_fkey (id, name, email),
      payee:users!settlements_payee_id_fkey (id, name, email)
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// ==========================================
// 4. CHAT OPERATIONS
// ==========================================

export async function sendChatMessage(expenseId, userId, message) {
  if (!expenseId || !userId || !message) {
    throw new Error('Expense ID, User ID, and message text are required');
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert([
      {
        expense_id: expenseId,
        user_id: userId,
        message: message.trim(),
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchExpenseChat(expenseId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      user:users (id, name, email)
    `)
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

// ==========================================
// 5. LEDGER, BALANCES AND DEBT SIMPLIFICATION
// ==========================================

export async function calculateBalancesAndDebts(groupId) {
  // 1. Fetch group members
  const members = await fetchGroupMembers(groupId);
  const memberMap = {};
  members.forEach((m) => {
    memberMap[m.id] = m;
  });

  // Initialize balances
  const netBalances = {};
  members.forEach((m) => {
    netBalances[m.id] = 0;
  });

  // 2. Fetch all expenses for this group
  const { data: expenses, error: expError } = await supabase
    .from('expenses')
    .select('id, paid_by, amount')
    .eq('group_id', groupId);

  if (expError) throw expError;

  // Add payments to net balances
  expenses.forEach((e) => {
    if (netBalances[e.paid_by] !== undefined) {
      netBalances[e.paid_by] += parseFloat(e.amount);
    }
  });

  // 3. Fetch all splits for those expenses
  const expenseIds = expenses.map((e) => e.id);
  if (expenseIds.length > 0) {
    const { data: splits, error: splitError } = await supabase
      .from('expense_splits')
      .select('user_id, amount')
      .in('expense_id', expenseIds);

    if (splitError) throw splitError;

    // Deduct owed amounts from net balances
    splits.forEach((s) => {
      if (netBalances[s.user_id] !== undefined) {
        netBalances[s.user_id] -= parseFloat(s.amount);
      }
    });
  }

  // 4. Fetch all settlements
  const { data: settlements, error: setError } = await supabase
    .from('settlements')
    .select('payer_id, payee_id, amount')
    .eq('group_id', groupId);

  if (setError) throw setError;

  // Adjust net balances according to settlements
  settlements.forEach((s) => {
    // Payer sent money, so their balance goes up (they owe less / are owed more)
    if (netBalances[s.payer_id] !== undefined) {
      netBalances[s.payer_id] += parseFloat(s.amount);
    }
    // Payee received money, so their balance goes down (they owe more / are owed less)
    if (netBalances[s.payee_id] !== undefined) {
      netBalances[s.payee_id] -= parseFloat(s.amount);
    }
  });

  // Clean up floating point arithmetic issues (round to 2 decimals)
  Object.keys(netBalances).forEach((uid) => {
    netBalances[uid] = Math.round(netBalances[uid] * 100) / 100;
  });

  // 5. Greedy Debt Simplification Algorithm
  // Separate debtors and creditors
  const debtors = [];
  const creditors = [];

  Object.entries(netBalances).forEach(([uid, balance]) => {
    if (balance < -0.01) {
      debtors.push({ userId: uid, balance });
    } else if (balance > 0.01) {
      creditors.push({ userId: uid, balance });
    }
  });

  // Sort debtors ascending (most negative first)
  debtors.sort((a, b) => a.balance - b.balance);
  // Sort creditors descending (most positive first)
  creditors.sort((a, b) => b.balance - a.balance);

  const simplifiedDebts = [];
  let dIdx = 0;
  let cIdx = 0;

  // Copy values to work on them
  const dList = debtors.map((d) => ({ ...d }));
  const cList = creditors.map((c) => ({ ...c }));

  while (dIdx < dList.length && cIdx < cList.length) {
    const debtor = dList[dIdx];
    const creditor = cList[cIdx];

    const dAmount = Math.abs(debtor.balance);
    const cAmount = creditor.balance;

    const settledAmount = Math.min(dAmount, cAmount);
    
    // Record simplified transaction
    simplifiedDebts.push({
      from: debtor.userId,
      fromUser: memberMap[debtor.userId],
      to: creditor.userId,
      toUser: memberMap[creditor.userId],
      amount: Math.round(settledAmount * 100) / 100,
    });

    // Update balances
    debtor.balance += settledAmount;
    creditor.balance -= settledAmount;

    if (Math.abs(debtor.balance) < 0.01) {
      dIdx++;
    }
    if (Math.abs(creditor.balance) < 0.01) {
      cIdx++;
    }
  }

  return {
    members,
    netBalances,
    simplifiedDebts,
  };
}
