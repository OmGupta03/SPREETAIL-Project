'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchGroupDetails,
  fetchGroupMembers,
  inviteUserToGroup,
  removeUserFromGroup,
  deleteGroup,
  addExpense,
  deleteExpense,
  recordSettlement,
  fetchGroupExpenses,
  fetchGroupSettlements,
  calculateBalancesAndDebts,
  sendChatMessage,
  fetchExpenseChat,
  fetchExpenseDetails
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Send,
  MessageSquare,
  Users,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Info,
  DollarSign,
  UserCheck,
  X,
  RefreshCw,
  Scale,
  FileSpreadsheet
} from 'lucide-react';
import Link from 'next/link';
import CsvImporter from '@/components/CsvImporter';

export default function GroupDetails() {
  const { id: groupId } = useParams();
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  // Data states
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [balances, setBalances] = useState({ netBalances: {}, simplifiedDebts: [], netBalancesByCurrency: { INR: {}, USD: {} }, simplifiedDebtsByCurrency: { INR: [], USD: [] } });
  const [pageLoading, setPageLoading] = useState(true);

  // Invite member state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Settle Up state
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [settlePayer, setSettlePayer] = useState('');
  const [settlePayee, setSettlePayee] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleError, setSettleError] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleCurrency, setSettleCurrency] = useState('INR');

  // Add Expense state
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expPayer, setExpPayer] = useState('');
  const [expSplitType, setExpSplitType] = useState('equal'); // equal, unequal, percentage, share
  const [expCurrency, setExpCurrency] = useState('INR');
  
  // Custom split inputs: userId -> string value
  const [splitInputs, setSplitInputs] = useState({}); 
  const [splitCheckboxes, setSplitCheckboxes] = useState({}); // userId -> boolean (for equal split select)
  const [expenseError, setExpenseError] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);

  // CSV Import state
  const [isCsvOpen, setIsCsvOpen] = useState(false);

  // Selected Expense Details Drawer state
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const loadData = async () => {
    if (!groupId || !user) return;
    try {
      const g = await fetchGroupDetails(groupId);
      setGroup(g);
      
      const m = await fetchGroupMembers(groupId);
      setMembers(m);

      const expList = await fetchGroupExpenses(groupId);
      setExpenses(expList);

      const setList = await fetchGroupSettlements(groupId);
      setSettlements(setList);

      const balData = await calculateBalancesAndDebts(groupId);
      setBalances(balData);
    } catch (err) {
      console.error('Error loading group details:', err);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    if (groupId && user) {
      loadData();
    }
  }, [groupId, user]);

  // Handle Realtime Subscription for Chat Messages
  useEffect(() => {
    if (!selectedExpense) return;

    // Fetch initial chat messages
    const getChat = async () => {
      try {
        const chats = await fetchExpenseChat(selectedExpense.id);
        setChatMessages(chats);
      } catch (err) {
        console.error('Error fetching chats:', err);
      }
    };
    getChat();

    // Subscribe to chat channel
    const channel = supabase
      .channel(`chat_${selectedExpense.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `expense_id=eq.${selectedExpense.id}`,
        },
        async (payload) => {
          // Fetch user details for the new message
          const { data: userMsg, error } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', payload.new.user_id)
            .single();

          const messageWithUser = {
            ...payload.new,
            user: userMsg || { id: payload.new.user_id, name: 'Unknown Member' }
          };
          
          setChatMessages((prev) => [...prev, messageWithUser]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedExpense]);

  // Scroll chat to bottom when messages load
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Set default values when modals open
  useEffect(() => {
    if (isExpenseOpen && members.length > 0) {
      setExpPayer(user.id);
      
      // Reset splits
      const defaultCheckboxes = {};
      const defaultInputs = {};
      members.forEach((m) => {
        defaultCheckboxes[m.id] = true;
        defaultInputs[m.id] = '';
      });
      setSplitCheckboxes(defaultCheckboxes);
      setSplitInputs(defaultInputs);
      setExpDescription('');
      setExpAmount('');
      setExpSplitType('equal');
      setExpCurrency('INR');
      setExpenseError('');
    }
  }, [isExpenseOpen, members, user]);

  useEffect(() => {
    if (isSettleOpen && members.length > 0) {
      setSettlePayer(user.id);
      // Pick first member who is not current user as default payee
      const alternative = members.find((m) => m.id !== user.id);
      setSettlePayee(alternative ? alternative.id : '');
      setSettleAmount('');
      setSettleCurrency('INR');
      setSettleError('');
    }
  }, [isSettleOpen, members, user]);

  // ==========================================
  // FORM HANDLERS
  // ==========================================

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    if (!inviteEmail.trim()) return;

    setInviteLoading(true);
    try {
      await inviteUserToGroup(groupId, inviteEmail.trim());
      setIsInviteOpen(false);
      setInviteEmail('');
      await loadData();
    } catch (err) {
      setInviteError(err.message || 'Failed to invite user.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (memberId, memberName) => {
    const confirmRemove = window.confirm(`Are you sure you want to remove ${memberName} from this group?`);
    if (!confirmRemove) return;

    try {
      await removeUserFromGroup(groupId, memberId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  const handleDeleteGroup = async () => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this group? All transaction logs, splits, and chat comments will be permanently erased.'
    );
    if (!confirmDelete) return;

    try {
      await deleteGroup(groupId);
      router.push('/');
    } catch (err) {
      alert(err.message || 'Failed to delete group.');
    }
  };

  const handleRecordSettlement = async (e) => {
    e.preventDefault();
    setSettleError('');

    if (!settlePayer || !settlePayee || !settleAmount) {
      setSettleError('All fields are required');
      return;
    }
    if (settlePayer === settlePayee) {
      setSettleError('Payer and Payee cannot be the same person.');
      return;
    }
    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt <= 0) {
      setSettleError('Settlement amount must be greater than 0');
      return;
    }

    setSettleLoading(true);
    try {
      await recordSettlement(groupId, settlePayer, settlePayee, amt, settleCurrency);
      setIsSettleOpen(false);
      await loadData();
    } catch (err) {
      setSettleError(err.message || 'Failed to record settlement.');
    } finally {
      setSettleLoading(false);
    }
  };

  const handleDeleteExpense = async (e, expenseId) => {
    e.stopPropagation(); // Avoid opening drawer
    const confirmDelete = window.confirm('Are you sure you want to delete this expense? All associated splits will be reverted.');
    if (!confirmDelete) return;

    try {
      await deleteExpense(expenseId);
      if (selectedExpense?.id === expenseId) {
        setSelectedExpense(null);
      }
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete expense.');
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    setExpenseError('');

    if (!expDescription.trim()) {
      setExpenseError('Description is required');
      return;
    }
    const totalAmt = parseFloat(expAmount);
    if (isNaN(totalAmt) || totalAmt <= 0) {
      setExpenseError('Total amount must be greater than 0');
      return;
    }

    // Prepare splits list
    const splits = [];

    if (expSplitType === 'equal') {
      // Find selected members
      const activeIds = Object.keys(splitCheckboxes).filter((uid) => splitCheckboxes[uid]);
      if (activeIds.length === 0) {
        setExpenseError('At least one member must participate in the split');
        return;
      }
      const splitAmt = Math.round((totalAmt / activeIds.length) * 100) / 100;
      let calculatedSum = 0;

      activeIds.forEach((uid, index) => {
        // Adjust for rounding differences on the last split item
        const finalAmt = index === activeIds.length - 1 ? (totalAmt - calculatedSum) : splitAmt;
        calculatedSum += finalAmt;

        splits.push({
          userId: uid,
          amount: Math.round(finalAmt * 100) / 100
        });
      });
    } 
    
    else if (expSplitType === 'unequal') {
      let sum = 0;
      for (const m of members) {
        const val = parseFloat(splitInputs[m.id] || 0);
        if (isNaN(val) || val < 0) {
          setExpenseError(`Invalid split amount for member ${m.name}`);
          return;
        }
        sum += val;
        splits.push({
          userId: m.id,
          amount: Math.round(val * 100) / 100
        });
      }

      if (Math.abs(sum - totalAmt) > 0.02) {
        setExpenseError(`Unequal splits sum to $${sum.toFixed(2)}, but total expense is $${totalAmt.toFixed(2)}. Difference must be 0.`);
        return;
      }
    } 
    
    else if (expSplitType === 'percentage') {
      let percentSum = 0;
      for (const m of members) {
        const pct = parseFloat(splitInputs[m.id] || 0);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          setExpenseError(`Invalid percentage for member ${m.name}`);
          return;
        }
        percentSum += pct;
      }

      if (Math.abs(percentSum - 100) > 0.01) {
        setExpenseError(`Percentages must sum to exactly 100% (currently ${percentSum.toFixed(1)}%).`);
        return;
      }

      let calculatedSum = 0;
      members.forEach((m, index) => {
        const pct = parseFloat(splitInputs[m.id] || 0);
        const splitAmt = index === members.length - 1 
          ? (totalAmt - calculatedSum) 
          : (totalAmt * pct) / 100;
        
        calculatedSum += Math.round(splitAmt * 100) / 100;

        splits.push({
          userId: m.id,
          amount: Math.round(splitAmt * 100) / 100,
          percentage: pct
        });
      });
    } 
    
    else if (expSplitType === 'share') {
      let totalShares = 0;
      for (const m of members) {
        const sh = parseFloat(splitInputs[m.id] || 0);
        if (isNaN(sh) || sh < 0) {
          setExpenseError(`Invalid share count for member ${m.name}`);
          return;
        }
        totalShares += sh;
      }

      if (totalShares <= 0) {
        setExpenseError('Total shares must be greater than 0');
        return;
      }

      let calculatedSum = 0;
      members.forEach((m, index) => {
        const sh = parseFloat(splitInputs[m.id] || 0);
        const splitAmt = index === members.length - 1
          ? (totalAmt - calculatedSum)
          : (totalAmt * sh) / totalShares;

        calculatedSum += Math.round(splitAmt * 100) / 100;

        splits.push({
          userId: m.id,
          amount: Math.round(splitAmt * 100) / 100,
          share: sh
        });
      });
    }

    setExpenseLoading(true);
    try {
      await addExpense(groupId, expPayer, expDescription.trim(), totalAmt, expSplitType, splits, expCurrency);
      setIsExpenseOpen(false);
      await loadData();
    } catch (err) {
      setExpenseError(err.message || 'Failed to add expense.');
    } finally {
      setExpenseLoading(false);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || chatLoading) return;

    setChatLoading(true);
    try {
      await sendChatMessage(selectedExpense.id, user.id, newMessage.trim());
      setNewMessage('');
    } catch (err) {
      console.error('Error posting message:', err);
    } finally {
      setChatLoading(false);
    }
  };

  const handleOpenExpenseDetails = async (expense) => {
    try {
      const details = await fetchExpenseDetails(expense.id);
      setSelectedExpense(details);
    } catch (err) {
      console.error('Failed to load expense details:', err);
    }
  };

  if (loading || pageLoading || !group) {
    return (
      <div className="flex-1 flex justify-center items-center min-h-screen bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="text-slate-400 text-sm">Loading group dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate my balance in this group
  const myBalanceINR = balances.netBalancesByCurrency?.INR?.[user.id] || 0;
  const myBalanceUSD = balances.netBalancesByCurrency?.USD?.[user.id] || 0;

  // Compile full ledger (combine expenses and settlements, sort chronological)
  const ledger = [
    ...expenses.map((e) => ({ ...e, type: 'expense' })),
    ...settlements.map((s) => ({ ...s, type: 'settlement' }))
  ];
  // Sort ledger by created_at descending (newest first)
  ledger.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="flex-1 flex bg-slate-950 min-h-screen relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      
      {/* Main Content Pane */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${selectedExpense ? 'mr-0 lg:mr-[400px]' : ''}`}>
        
        {/* Navbar Header */}
        <header className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="p-2 rounded-xl text-slate-450 hover:text-white hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">{group.name}</h1>
                <p className="text-xs text-slate-450 mt-0.5">Ledger details and balances</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={loadData}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-all"
                title="Refresh page"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              {balances.simplifiedDebts.length === 0 && (
                <button
                  onClick={handleDeleteGroup}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 hover:border-red-900 text-rose-455 hover:text-rose-400 transition-all text-xs font-semibold"
                  title="Delete settled group"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Group</span>
                </button>
              )}

              <button
                onClick={() => setIsCsvOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white transition-all text-xs font-semibold"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-450" />
                <span>Import CSV</span>
              </button>

              <button
                onClick={() => setIsInviteOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white transition-all text-xs font-semibold"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Invite Member</span>
              </button>
            </div>
          </div>
        </header>

        {/* Core Layout Grid */}
        <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto">
          
          {/* LEFT PANEL: Members, Balances, Simplified Debts */}
          <div className="space-y-6 md:col-span-1">
            
            {/* Net Balance Status summary card */}
            <div className="relative overflow-hidden p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950 border border-slate-800/80 rounded-2xl shadow-xl backdrop-blur-xl">
              <div className="absolute top-[-30%] right-[-10%] h-[120px] w-[120px] rounded-full bg-emerald-500/5 blur-[40px] pointer-events-none"></div>
              <div className="relative z-10 space-y-3">
                <h2 className="text-xs font-semibold text-slate-450 uppercase tracking-wider">My Group Balance</h2>
                <div className="space-y-1">
                  <div className={`text-xl font-extrabold tracking-tight ${
                    myBalanceINR > 0.01 
                      ? 'text-emerald-400' 
                      : myBalanceINR < -0.01 
                      ? 'text-rose-450' 
                      : 'text-slate-500'
                  }`}>
                    {myBalanceINR > 0.01 ? '+' : ''}₹{myBalanceINR.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] font-normal text-slate-550">INR</span>
                  </div>
                  <div className={`text-xl font-extrabold tracking-tight ${
                    myBalanceUSD > 0.01 
                      ? 'text-emerald-400' 
                      : myBalanceUSD < -0.01 
                      ? 'text-rose-400' 
                      : 'text-slate-500'
                  }`}>
                    {myBalanceUSD > 0.01 ? '+' : ''}${myBalanceUSD.toFixed(2)} <span className="text-[10px] font-normal text-slate-550">USD</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setIsSettleOpen(true)}
                className="w-full mt-5 py-2.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-455 hover:text-emerald-400 rounded-xl font-bold text-sm transition-all flex items-center justify-center space-x-2 shadow-md shadow-emerald-500/2"
              >
                <DollarSign className="h-4 w-4" />
                <span>Record Settle Up</span>
              </button>
            </div>

            {/* Members List */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  <span>Group Members</span>
                </h3>
                <span className="px-2 py-0.5 text-[10px] bg-slate-800 border border-slate-700 text-slate-300 font-semibold rounded-full">
                  {members.length}
                </span>
              </div>

              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {members.map((m) => {
                  const balINR = balances.netBalancesByCurrency?.INR?.[m.id] || 0;
                  const balUSD = balances.netBalancesByCurrency?.USD?.[m.id] || 0;
                  const isCurrentUser = m.id === user.id;
                  
                  const isSettled = Math.abs(balINR) <= 0.01 && Math.abs(balUSD) <= 0.01;
                  
                  return (
                    <div key={m.id} className="flex items-center justify-between group/member text-sm">
                      <div className="flex items-center space-x-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center">
                          {m.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200">
                            {m.name} {isCurrentUser && <span className="text-[10px] text-slate-500 font-medium">(you)</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right flex flex-col items-end">
                          {balINR > 0.01 ? (
                            <span className="text-emerald-400 font-semibold text-[11px]">+₹{balINR.toLocaleString()}</span>
                          ) : balINR < -0.01 ? (
                            <span className="text-rose-400 font-semibold text-[11px]">-₹{Math.abs(balINR).toLocaleString()}</span>
                          ) : null}
                          
                          {balUSD > 0.01 ? (
                            <span className="text-emerald-400 font-semibold text-[11px]">+${balUSD.toFixed(2)}</span>
                          ) : balUSD < -0.01 ? (
                            <span className="text-rose-405 font-semibold text-[11px]">-${Math.abs(balUSD).toFixed(2)}</span>
                          ) : null}

                          {isSettled && (
                            <span className="text-slate-550 text-xs">₹0.00</span>
                          )}
                        </div>

                        {/* Delete Member (only show if balance is 0 and not current user) */}
                        {!isCurrentUser && isSettled && (
                          <button
                            onClick={() => handleRemoveMember(m.id, m.name)}
                            className="p-1 rounded text-slate-550 hover:text-rose-400 hover:bg-slate-800 transition-all opacity-0 group-hover/member:opacity-100"
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simplified Debts List (Greedy Algorithm Results) */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
                <Scale className="h-4 w-4 text-emerald-400" />
                <span>Simplified Debts</span>
              </h3>

              {balances.simplifiedDebtsByCurrency?.INR?.length === 0 && balances.simplifiedDebtsByCurrency?.USD?.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">No debts to settle. Everything is perfectly balanced!</p>
              ) : (
                <div className="space-y-4">
                  {/* INR Debts */}
                  {balances.simplifiedDebtsByCurrency?.INR?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">INR DEBTS</h4>
                      {balances.simplifiedDebtsByCurrency.INR.map((debt, index) => {
                        const isFromMe = debt.from === user.id;
                        const isToMe = debt.to === user.id;
                        return (
                          <div key={`inr-${index}`} className="flex items-center space-x-3 text-xs bg-slate-950/45 p-2.5 rounded-xl border border-slate-850">
                            <div className="flex-1 min-w-0">
                              <span className={isFromMe ? 'text-rose-350 font-semibold' : 'text-slate-355'}>
                                {isFromMe ? 'You' : debt.fromUser?.name || 'Someone'}
                              </span>
                              <span className="text-slate-500 mx-1">owes</span>
                              <span className={isToMe ? 'text-emerald-355 font-semibold' : 'text-slate-355'}>
                                {isToMe ? 'You' : debt.toUser?.name || 'Someone'}
                              </span>
                            </div>
                            <div className="font-bold text-xs bg-slate-850 px-2 py-0.5 rounded-lg border border-slate-800 text-slate-200">
                              ₹{debt.amount.toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* USD Debts */}
                  {balances.simplifiedDebtsByCurrency?.USD?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">USD DEBTS</h4>
                      {balances.simplifiedDebtsByCurrency.USD.map((debt, index) => {
                        const isFromMe = debt.from === user.id;
                        const isToMe = debt.to === user.id;
                        return (
                          <div key={`usd-${index}`} className="flex items-center space-x-3 text-xs bg-slate-950/45 p-2.5 rounded-xl border border-slate-850">
                            <div className="flex-1 min-w-0">
                              <span className={isFromMe ? 'text-rose-350 font-semibold' : 'text-slate-355'}>
                                {isFromMe ? 'You' : debt.fromUser?.name || 'Someone'}
                              </span>
                              <span className="text-slate-500 mx-1">owes</span>
                              <span className={isToMe ? 'text-emerald-355 font-semibold' : 'text-slate-355'}>
                                {isToMe ? 'You' : debt.toUser?.name || 'Someone'}
                              </span>
                            </div>
                            <div className="font-bold text-xs bg-slate-850 px-2 py-0.5 rounded-lg border border-slate-800 text-slate-200">
                              ${debt.amount.toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT PANEL: Chronological transaction ledger */}
          <div className="md:col-span-2 space-y-4 flex flex-col h-full">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Transaction History</span>
              </h2>
              
              <button
                onClick={() => setIsExpenseOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-450 hover:to-teal-450 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/10 transition-all"
              >
                <Plus className="h-4.5 w-4.5" />
                <span>Add Expense</span>
              </button>
            </div>

            {ledger.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-slate-850 rounded-2xl text-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">No expenses recorded</h3>
                  <p className="text-slate-500 text-xs mt-1 max-w-xs mx-auto">Start splitting costs! Click "Add Expense" to record rent, groceries, or dinner.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
                {ledger.map((item) => {
                  if (item.type === 'expense') {
                    const isPayerMe = item.paid_by === user.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleOpenExpenseDetails(item)}
                        className={`flex items-center justify-between p-4 bg-slate-900/40 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 rounded-2xl transition-all cursor-pointer group shadow-sm ${
                          selectedExpense?.id === item.id ? 'ring-1 ring-emerald-500 bg-slate-900 border-transparent shadow-emerald-500/5' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-4 min-w-0">
                          <div className="h-10 w-10 bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-center text-slate-300 group-hover:text-emerald-450 transition-colors">
                            <Info className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-sm truncate">{item.description}</h4>
                            <p className="text-slate-550 text-xs mt-0.5">
                              Paid by <span className="text-slate-350">{isPayerMe ? 'You' : item.payer?.name || 'Deleted User'}</span> · {new Date(item.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4 text-right">
                          <div className="flex items-center space-x-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              item.currency === 'USD' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {item.currency}
                            </span>
                            <div>
                              <p className="text-[10px] text-slate-500">total</p>
                              <p className={`font-bold text-sm ${parseFloat(item.amount) < 0 ? 'text-rose-455' : 'text-white'}`}>
                                {parseFloat(item.amount) < 0 ? '-' : ''}
                                {item.currency === 'USD' ? '$' : '₹'}
                                {Math.abs(parseFloat(item.amount)).toFixed(2)}
                              </p>
                            </div>
                          </div>
                          
                          <button
                            onClick={(e) => handleDeleteExpense(e, item.id)}
                            className="p-2 rounded-xl text-slate-600 hover:text-rose-400 hover:bg-slate-800/60 border border-transparent hover:border-slate-800 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete expense"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>

                          <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-emerald-400 transition-colors hidden sm:block" />
                        </div>
                      </div>
                    );
                  } else {
                    // Settlement card
                    const isPayerMe = item.payer_id === user.id;
                    const isPayeeMe = item.payee_id === user.id;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 bg-slate-900/15 border border-slate-900 border-dashed rounded-2xl"
                      >
                        <div className="flex items-center space-x-4 min-w-0">
                          <div className="h-9 w-9 bg-emerald-500/10 border border-emerald-500/20 text-emerald-455 rounded-xl flex items-center justify-center">
                            <UserCheck className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 text-xs">
                            <p className="font-semibold text-slate-300">
                              <span className={isPayerMe ? 'text-emerald-450 font-bold' : ''}>
                                {isPayerMe ? 'You' : item.payer?.name || 'Someone'}
                              </span>
                              <span className="text-slate-500 mx-1 font-normal">paid</span>
                              <span className={isPayeeMe ? 'text-emerald-450 font-bold' : ''}>
                                {isPayeeMe ? 'You' : item.payee?.name || 'Someone'}
                              </span>
                            </p>
                            <p className="text-slate-550 mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className={`px-1 rounded text-[9px] font-bold ${
                            item.currency === 'USD' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {item.currency}
                          </span>
                          <div className="text-right bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl font-bold text-xs text-emerald-400">
                            {item.currency === 'USD' ? '$' : '₹'}{parseFloat(item.amount).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )}

          </div>

        </div>

      </div>

      {/* DETAILED EXPENSE DRAWER (Chat Sync) */}
      <div className={`fixed top-0 right-0 bottom-0 z-30 w-full sm:w-[400px] bg-slate-900 border-l border-slate-800 shadow-2xl transition-all duration-300 flex flex-col ${
        selectedExpense ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {selectedExpense && (
          <>
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850/30">
              <div>
                <h3 className="text-base font-bold text-white">{selectedExpense.description}</h3>
                <p className="text-[11px] text-slate-450 mt-0.5">Paid by {selectedExpense.payer?.name || 'Deleted User'}</p>
              </div>
              
              <button
                onClick={() => setSelectedExpense(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Expense breakdown metadata */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/20 space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-450">Total Amount</span>
                <span className="text-2xl font-extrabold text-white">
                  {selectedExpense.currency === 'USD' ? '$' : '₹'}
                  {Math.abs(parseFloat(selectedExpense.amount)).toFixed(2)}
                </span>
              </div>

              <div className="space-y-2.5">
                <span className="text-[11px] font-semibold text-slate-450 uppercase tracking-wider block">Split Breakdown</span>
                <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-850 text-xs">
                  {selectedExpense.splits?.map((split) => (
                    <div key={split.id} className="flex justify-between items-center">
                      <span className="text-slate-350">{split.user?.name}</span>
                      <span className="font-bold text-slate-200">
                        {selectedExpense.currency === 'USD' ? '$' : '₹'}
                        {Math.abs(parseFloat(split.amount)).toFixed(2)}
                        {selectedExpense.split_type === 'percentage' && split.percentage && ` (${split.percentage}%)`}
                        {selectedExpense.split_type === 'share' && split.share && ` (${split.share} shares)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* LIVE COMMENTS SECTION */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/10">
              <div className="p-3 border-b border-slate-800 flex items-center space-x-1.5 bg-slate-850/10">
                <MessageSquare className="h-4 w-4 text-emerald-450" />
                <span className="text-xs font-bold text-slate-300">Expense Discussion</span>
              </div>

              {/* Message History */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
                    <MessageSquare className="h-8 w-8 text-slate-700" />
                    <p className="text-xs text-slate-500 italic">No comments posted yet.</p>
                    <p className="text-[10px] text-slate-600 max-w-[200px]">Have a dispute or correction? Post a message below in real-time.</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.user_id === user.id;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-slate-500 mb-1 font-medium">{msg.user?.name}</span>
                        <div className={`p-3 rounded-2xl max-w-[85%] text-xs shadow-md ${
                          isMe 
                            ? 'bg-emerald-500 text-slate-950 rounded-tr-none font-medium' 
                            : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-750'
                        }`}>
                          <p>{msg.message}</p>
                        </div>
                        <span className="text-[9px] text-slate-600 mt-0.5">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendChatMessage} className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || chatLoading}
                  className="p-2.5 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ==========================================
          MODALS SECTION
         ========================================== */}

      {/* INVITE MEMBER MODAL */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Invite Group Member</h3>
              <button
                onClick={() => {
                  setIsInviteOpen(false);
                  setInviteEmail('');
                  setInviteError('');
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {inviteError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900 text-red-200 text-xs">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="inviteEmail" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  User Email Address
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  required
                  placeholder="e.g. friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">Note: The user must already be signed up on the app before they can be added.</p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteOpen(false);
                    setInviteEmail('');
                    setInviteError('');
                  }}
                  className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all text-sm font-semibold border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-450 hover:to-teal-450 text-slate-950 disabled:opacity-50 transition-all text-sm font-bold shadow-md shadow-emerald-500/10"
                >
                  {inviteLoading ? 'Inviting...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD SETTLEMENT MODAL */}
      {isSettleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Record Settle Up</h3>
              <button
                onClick={() => setIsSettleOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {settleError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900 text-red-200 text-xs">
                {settleError}
              </div>
            )}

            <form onSubmit={handleRecordSettlement} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settlePayer" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Payer
                  </label>
                  <select
                    id="settlePayer"
                    value={settlePayer}
                    onChange={(e) => setSettlePayer(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === user.id ? '(you)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="settlePayee" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Payee
                  </label>
                  <select
                    id="settlePayee"
                    value={settlePayee}
                    onChange={(e) => setSettlePayee(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === user.id ? '(you)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="settleAmount" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Amount
                </label>
                <div className="flex space-x-2">
                  <select
                    value={settleCurrency}
                    onChange={(e) => setSettleCurrency(e.target.value)}
                    className="px-2.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="INR">₹ INR</option>
                    <option value="USD">$ USD</option>
                  </select>
                  <input
                    id="settleAmount"
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="flex-1 px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettleOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all text-sm font-semibold border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settleLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-450 hover:to-teal-450 text-slate-950 disabled:opacity-50 transition-all text-sm font-bold shadow-md shadow-emerald-500/10"
                >
                  {settleLoading ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD EXPENSE MODAL */}
      {isExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Add Group Expense</h3>
              <button
                onClick={() => setIsExpenseOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {expenseError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900 text-red-200 text-xs">
                {expenseError}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="expDescription" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <input
                    id="expDescription"
                    type="text"
                    required
                    placeholder="e.g. Dinner, Rent bill"
                    value={expDescription}
                    onChange={(e) => setExpDescription(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="expAmount" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Amount
                  </label>
                  <div className="flex space-x-2">
                    <select
                      value={expCurrency}
                      onChange={(e) => setExpCurrency(e.target.value)}
                      className="px-2.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="INR">₹ INR</option>
                      <option value="USD">$ USD</option>
                    </select>
                    <input
                      id="expAmount"
                      type="number"
                      step="0.001"
                      required
                      placeholder="0.00"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="expPayer" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Paid By
                  </label>
                  <select
                    id="expPayer"
                    value={expPayer}
                    onChange={(e) => setExpPayer(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === user.id ? '(you)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="expSplitType" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Split Type
                  </label>
                  <select
                    id="expSplitType"
                    value={expSplitType}
                    onChange={(e) => setExpSplitType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="equal">Equally</option>
                    <option value="unequal">Unequally (Exact amounts)</option>
                    <option value="percentage">By Percentage (%)</option>
                    <option value="share">By Share</option>
                  </select>
                </div>
              </div>

              {/* DYNAMIC SPLIT SELECTION PANEL */}
              <div className="border-t border-slate-800 pt-4 space-y-3.5">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Split Details</span>
                
                {/* 1. Equal splits checkbox list */}
                {expSplitType === 'equal' && (
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-3 max-h-[160px] overflow-y-auto">
                    {members.map((m) => (
                      <label key={m.id} className="flex items-center space-x-3 text-xs text-slate-200 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!splitCheckboxes[m.id]}
                          onChange={(e) => {
                            setSplitCheckboxes((prev) => ({
                              ...prev,
                              [m.id]: e.target.checked
                            }));
                          }}
                          className="h-4 w-4 bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0 rounded"
                        />
                        <span>{m.name} {m.id === user.id ? '(you)' : ''}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 2. Unequal, percentage, share inputs */}
                {expSplitType !== 'equal' && (
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850 space-y-3 max-h-[220px] overflow-y-auto">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between space-x-4 text-xs">
                        <span className="text-slate-350">{m.name} {m.id === user.id ? '(you)' : ''}</span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder={expSplitType === 'unequal' ? '0.00' : expSplitType === 'percentage' ? '0' : '1'}
                            value={splitInputs[m.id] || ''}
                            onChange={(e) => {
                              setSplitInputs((prev) => ({
                                ...prev,
                                [m.id]: e.target.value
                              }));
                            }}
                            className="w-24 px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-center text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-slate-500 font-bold w-4">
                            {expSplitType === 'unequal' ? (expCurrency === 'USD' ? '$' : '₹') : expSplitType === 'percentage' ? '%' : 'sh'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all text-sm font-semibold border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-450 hover:to-teal-450 text-slate-950 disabled:opacity-50 transition-all text-sm font-bold shadow-md shadow-emerald-500/10"
                >
                  {expenseLoading ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {isCsvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-450" />
                  <span>CSV Ingestion Wizard</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Ingest historical expenses directly into this group</p>
              </div>
              <button
                onClick={() => {
                  setIsCsvOpen(false);
                }}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg border border-slate-800"
              >
                ✕
              </button>
            </div>

            <CsvImporter 
              currentUserId={user.id} 
              targetGroupId={groupId}
              onImportSuccess={() => {
                setIsCsvOpen(false);
                loadData();
              }} 
            />
          </div>
        </div>
      )}

    </div>
  );
}
