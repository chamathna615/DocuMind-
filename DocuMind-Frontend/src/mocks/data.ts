import type { ActivityLog, Lecture, QuizQuestion, User } from '@/types'

export const users: User[] = [
  { id:'u1', name:'Nimali Perera', email:'student@example.com', role:'student', status:'active', programme:'BSc Information Technology', preferredLanguage:'English', joinedAt:'2026-01-18', lastActive:'2026-08-31', uploadCount:12 },
  { id:'a1', name:'Kavindu Wijayarathna', email:'admin@example.com', role:'admin', status:'active', preferredLanguage:'English', joinedAt:'2025-12-02', lastActive:'2026-08-31', uploadCount:0 },
  ...['Ayesha Fernando','Ruwan Silva','Maya Thompson','Dineth Jayasinghe','Zara Khan','Tharushi De Alwis','Ethan Brown','Imesha Karunaratne','Noah Martin','Sachini Gunawardena'].map((name,index)=>({
    id:`u${index+2}`, name, email:`student${index+2}@example.com`, role:'student' as const, status:(index===6?'inactive':'active') as 'active'|'inactive', preferredLanguage:'English', joinedAt:`2026-0${(index%7)+1}-${String(10+index).padStart(2,'0')}`, lastActive:'2026-08-29', uploadCount:2+index,
  })),
]

const lectureSeed = [
  ['Machine Learning Fundamentals','Data Science','week-03-ml.mp4','MP4','completed',88],
  ['Database Normalisation','Database Systems','db-normalisation.mp3','MP3','completed',76],
  ['Software Testing Strategies','Software Engineering','testing-lecture.mp4','MP4','transcribing',0],
  ['Network Security Basics','Computer Networks','network-security.mp3','MP3','generating',0],
  ['Human Computer Interaction','HCI','hci-week-07.mp4','MP4','completed',92],
  ['Operating System Scheduling','Operating Systems','cpu-scheduling.mp3','MP3','failed',0],
  ['Cloud Computing Models','Cloud Computing','cloud-models.mp4','MP4','cancelled',0],
  ['Data Structures: Trees','Algorithms','trees.mp3','MP3','completed',81],
  ['Object Oriented Design','Programming','ood.mp4','MP4','preparing',0],
  ['Research Methodology','Research Methods','research-methods.mp3','MP3','completed',69],
  ['Web Accessibility','Web Development','a11y.mp4','MP4','validating',0],
  ['Introduction to AI Ethics','Artificial Intelligence','ai-ethics-reading.pdf','PDF','uploaded',0],
] as const

export const lectures: Lecture[] = lectureSeed.map((item,index)=>({
  id:`lec-${index+1}`, title:item[0], course:item[1], filename:item[2], fileType:item[3], status:item[4], quizScore:item[5]||undefined,
  fileSize:item[3]==='MP4'?126_500_000:item[3]==='PDF'?8_400_000:48_200_000, uploadedAt:new Date(2026,7,28-index).toISOString(), progress:item[4]==='completed'?100:{uploaded:8,validating:16,preparing:26,transcribing:52,generating:76,failed:45,cancelled:22}[item[4]],
  duration:`${18+index}:2${index%6}`, userId:'u1', outputs:item[4]==='completed'?['notes','quiz','tutorial','transcript']:[], jobId:`JOB-26-${String(1042+index).padStart(5,'0')}`,
}))

export const quizQuestions: QuizQuestion[] = [
  {id:'q1',type:'mcq',prompt:'What is the primary goal of supervised learning?',options:['Discover hidden clusters','Learn from labelled examples','Reduce dimensionality','Generate random samples'],answer:'Learn from labelled examples',explanation:'Supervised learning maps inputs to known labels using labelled training examples.'},
  {id:'q2',type:'mcq',prompt:'Which task is an example of classification?',options:['Predicting house price','Grouping customers','Detecting spam email','Compressing an image'],answer:'Detecting spam email',explanation:'Spam detection assigns an email to one of two discrete classes.'},
  {id:'q3',type:'short',prompt:'In one sentence, explain overfitting.',answer:'A model learns training noise and fails to generalise.',keywords:['training','generalise'],explanation:'Overfitting occurs when a model captures training-specific noise instead of general patterns.'},
  {id:'q4',type:'mcq',prompt:'Which dataset is used to tune model hyperparameters?',options:['Training set','Validation set','Production set','Archive set'],answer:'Validation set',explanation:'The validation set supports model selection and hyperparameter tuning.'},
  {id:'q5',type:'mcq',prompt:'What does a confusion matrix summarise?',options:['Model size','Classification outcomes','Training speed','Feature count'],answer:'Classification outcomes',explanation:'It tabulates predicted versus actual classifications.'},
  {id:'q6',type:'short',prompt:'Name one technique used to reduce overfitting.',answer:'Regularisation',keywords:['regularisation','regularization','dropout','cross-validation'],explanation:'Regularisation, dropout, early stopping, and cross-validation can reduce overfitting.'},
  {id:'q7',type:'mcq',prompt:'Precision is most useful when which error is costly?',options:['False positive','True positive','True negative','Missing feature'],answer:'False positive',explanation:'Precision focuses on how many positive predictions are actually positive.'},
  {id:'q8',type:'mcq',prompt:'Recall measures the share of what?',options:['All predictions that are correct','Actual positives found','Actual negatives found','Features retained'],answer:'Actual positives found',explanation:'Recall is true positives divided by all actual positives.'},
  {id:'q9',type:'short',prompt:'What is a feature?',answer:'An input variable used by a model.',keywords:['input','variable'],explanation:'A feature is a measurable input attribute supplied to the model.'},
  {id:'q10',type:'mcq',prompt:'Why split data into training and test sets?',options:['To increase file size','To estimate generalisation','To remove labels','To avoid preprocessing'],answer:'To estimate generalisation',explanation:'Held-out test data gives an unbiased estimate of performance on unseen examples.'},
]

export const notesMarkdown = `## 1. Foundations of Machine Learning
Machine learning enables systems to identify patterns and improve performance from examples, without every rule being explicitly programmed.

### Key concepts
- **Features** are the measurable inputs supplied to a model.
- **Labels** are target outcomes in supervised learning.
- A **model** represents the relationship learned from data.

## 2. The Learning Workflow
The practical workflow includes collecting data, cleaning it, selecting useful features, training a model, and evaluating it on unseen examples.

### Why evaluation matters
- Training accuracy alone can be misleading.
- A separate validation set helps with model selection.
- A test set estimates real-world generalisation.

## 3. Classification Metrics
Accuracy gives an overall view, while precision and recall reveal different kinds of error. A confusion matrix connects predictions to actual outcomes.

## 4. Avoiding Overfitting
Overfitting happens when a model memorises noise. Use regularisation, cross-validation, early stopping, or additional representative data.

## Key takeaways
- Match the learning method to the problem and available labels.
- Protect evaluation data from training leakage.
- Choose metrics based on the cost of mistakes.
- Prefer models that generalise, not those that only fit training data.`

export const tutorialMarkdown = `## Learning objectives
By the end of this guide, you will be able to distinguish supervised and unsupervised learning, describe a standard model workflow, and interpret common classification metrics.

## Step 1 — Frame the problem
Write down the decision the model should support. Decide whether the expected output is a category, a number, or a group.

## Step 2 — Prepare examples
Collect representative data, correct obvious errors, handle missing values, and document each feature. Keep a test set aside before experimenting.

## Step 3 — Train a baseline
Start with a simple model. A baseline makes later improvements measurable and easier to explain.

## Example
For spam detection, an email's word patterns are features and **spam / not spam** is the label. Precision matters when blocking a legitimate message would be costly.

## Step 4 — Evaluate and improve
Compare validation metrics, inspect errors, and change one assumption at a time. Confirm final performance only once on the test set.

## Revision checklist
- [ ] I can define features and labels.
- [ ] I can explain overfitting.
- [ ] I can choose between precision and recall.
- [ ] I understand why test data remains separate.

## Key takeaway
Good machine learning is an iterative evidence-driven process, not simply choosing the most complex algorithm.`

export const transcriptText = `00:00 Welcome to today's lecture on machine learning fundamentals. We will begin with what it means for a computer system to learn from examples.\n\n02:14 In supervised learning, each training example includes an input and a known output. We call the inputs features and the desired outputs labels.\n\n07:48 It is important to reserve data for validation and testing. Otherwise, a model can appear strong while only memorising its training examples.\n\n13:05 Let us compare accuracy, precision, and recall. Precision is especially important when false positives have a high cost. Recall matters when missing a positive case is costly.\n\n19:32 Overfitting is a central challenge. Regularisation, cross-validation, and early stopping are common controls.\n\n25:10 To conclude, begin with a clearly framed problem, establish a simple baseline, evaluate on unseen data, and iterate carefully.`

export const activityLogs: ActivityLog[] = Array.from({length:12},(_,i)=>({
  id:`log-${i}`, timestamp:new Date(2026,7,31,14-i,12).toISOString(), user:i%3===0?'System':users[(i%10)+1].name,
  action:['Upload created','Processing completed','User signed in','Quiz submitted'][i%4], entity:i%2?'Account':`JOB-26-${1042+i}`,
  result:i===7?'Failed':'Success', details:i===7?'Processing provider timeout; retry available.':'Operation completed normally.',
}))
